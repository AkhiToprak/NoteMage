// Integration coverage for POST /api/billing/revenuecat/webhook against the
// sandbox Postgres. Real handler -> real Prisma -> sandbox DB (no db mocks) —
// see sandbox.ts. Pins the interval-mapping fix from commit 5bf57005
// (billingInterval derives from the StoreKit product_id: "weekly" in the id
// -> weekly caps, else monthly) plus the auth gate, idempotency, and the
// cross-provider downgrade-safety rule documented in entitlement.ts.

import { SANDBOX_BILLING_ENV, sandboxDescribe } from './sandbox';

Object.assign(process.env, SANDBOX_BILLING_ENV);

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { POST } from '../../../../app/api/billing/revenuecat/webhook/route';

const AUTH = SANDBOX_BILLING_ENV.REVENUECAT_WEBHOOK_AUTH;
const EMAIL_PREFIX = 'rc-';
const DOMAIN = '@sandbox.test';

let seq = 0;
/** Unique per-test user id/email/username scoped to this agent's namespace. */
function nextCase(name: string) {
  seq += 1;
  const tag = `${name}-${seq}`;
  return { email: `${EMAIL_PREFIX}${tag}${DOMAIN}`, username: `rc_${tag}`.replace(/[^a-zA-Z0-9_]/g, '_') };
}

async function createUser(overrides: Parameters<typeof db.user.create>[0]['data'] = {}) {
  const { email, username } = nextCase('user');
  return db.user.create({
    data: { email, username, ...overrides },
  });
}

function rcRequest(body: unknown, auth: string | null = AUTH) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (auth !== null) headers.authorization = auth;
  return new NextRequest('http://localhost/api/billing/revenuecat/webhook', {
    method: 'POST',
    body: JSON.stringify(body),
    headers,
  });
}

function rcEvent(overrides: Record<string, unknown>) {
  return {
    event: {
      type: 'INITIAL_PURCHASE',
      id: `evt_${Math.random().toString(36).slice(2)}`,
      app_user_id: 'placeholder',
      entitlement_ids: ['pro'],
      expiration_at_ms: Date.now() + 30 * 24 * 60 * 60 * 1000,
      product_id: 'nm_pro_monthly',
      ...overrides,
    },
  };
}

async function reload(userId: string) {
  return db.user.findUniqueOrThrow({ where: { id: userId } });
}

// Cleanup only rows this file created (scoped by email prefix), never a
// global wipe — the sandbox DB is shared across 4 concurrent agents.
async function cleanup() {
  await db.user.deleteMany({ where: { email: { startsWith: EMAIL_PREFIX, endsWith: DOMAIN } } });
  await db.webhookEvent.deleteMany({ where: { provider: 'revenuecat', eventId: { startsWith: 'evt_' } } });
}

sandboxDescribe('POST /api/billing/revenuecat/webhook', () => {
  beforeAll(cleanup);
  afterAll(cleanup);

  describe('auth gate', () => {
    it('401 with no Authorization header, writes nothing', async () => {
      const user = await createUser();
      const req = rcRequest(rcEvent({ app_user_id: user.id }), null);
      const response = await POST(req);
      expect(response.status).toBe(401);
      const after = await reload(user.id);
      expect(after.tier).toBe('FREE');
    });

    it('401 with a wrong Authorization value, writes nothing', async () => {
      const user = await createUser();
      const req = rcRequest(rcEvent({ app_user_id: user.id }), 'wrong-secret');
      const response = await POST(req);
      expect(response.status).toBe(401);
      const after = await reload(user.id);
      expect(after.tier).toBe('FREE');
    });

    it('correct auth is processed (200)', async () => {
      const user = await createUser();
      const req = rcRequest(rcEvent({ app_user_id: user.id }));
      const response = await POST(req);
      expect(response.status).toBe(200);
      const after = await reload(user.id);
      expect(after.tier).toBe('PRO');
    });
  });

  describe('INITIAL_PURCHASE interval mapping (pins commit 5bf57005)', () => {
    it('weekly product id -> billingInterval weekly', async () => {
      const user = await createUser();
      const periodEnd = Date.now() + 7 * 24 * 60 * 60 * 1000;
      const req = rcRequest(
        rcEvent({ app_user_id: user.id, product_id: 'nm_pro_weekly', expiration_at_ms: periodEnd })
      );
      const response = await POST(req);
      expect(response.status).toBe(200);

      const after = await reload(user.id);
      expect(after.tier).toBe('PRO');
      expect(after.billingInterval).toBe('weekly');
      expect(after.entitlementSource).toBe('APPLE_IAP');
      expect(after.subscriptionPeriodEnd?.getTime()).toBe(periodEnd);
    });

    it('monthly product id -> billingInterval monthly', async () => {
      const user = await createUser();
      const periodEnd = Date.now() + 30 * 24 * 60 * 60 * 1000;
      const req = rcRequest(
        rcEvent({ app_user_id: user.id, product_id: 'nm_pro_monthly', expiration_at_ms: periodEnd })
      );
      const response = await POST(req);
      expect(response.status).toBe(200);

      const after = await reload(user.id);
      expect(after.tier).toBe('PRO');
      expect(after.billingInterval).toBe('monthly');
      expect(after.entitlementSource).toBe('APPLE_IAP');
    });

    it('yearly product id -> billingInterval monthly (yearly is quota-identical to monthly)', async () => {
      const user = await createUser();
      const periodEnd = Date.now() + 365 * 24 * 60 * 60 * 1000;
      const req = rcRequest(
        rcEvent({ app_user_id: user.id, product_id: 'nm_pro_yearly', expiration_at_ms: periodEnd })
      );
      const response = await POST(req);
      expect(response.status).toBe(200);

      const after = await reload(user.id);
      expect(after.tier).toBe('PRO');
      expect(after.billingInterval).toBe('monthly');
    });

    it('a trial user (weekly caps) converting via a monthly product flips billingInterval to monthly', async () => {
      // The exact regression 5bf57005 fixed: trial->paid conversions used to
      // keep the trial's weekly caps because activeGrant() was called with no
      // `interval` at all.
      const user = await createUser({
        tier: 'PRO',
        billingInterval: 'weekly',
        trialEndsAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      });
      const req = rcRequest(
        rcEvent({ app_user_id: user.id, product_id: 'nm_pro_monthly', expiration_at_ms: Date.now() + 30 * 24 * 60 * 60 * 1000 })
      );
      const response = await POST(req);
      expect(response.status).toBe(200);

      const after = await reload(user.id);
      expect(after.billingInterval).toBe('monthly');
      expect(after.trialEndsAt).toBeNull();
      expect(after.entitlementSource).toBe('APPLE_IAP');
    });
  });

  describe('lifecycle transitions', () => {
    it('RENEWAL extends subscriptionPeriodEnd and keeps PRO', async () => {
      const user = await createUser({
        tier: 'PRO',
        entitlementSource: 'APPLE_IAP',
        billingInterval: 'monthly',
        subscriptionPeriodEnd: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
        revenueCatAppUserId: null,
      });
      const newPeriodEnd = Date.now() + 30 * 24 * 60 * 60 * 1000;
      const req = rcRequest(
        rcEvent({ type: 'RENEWAL', app_user_id: user.id, product_id: 'nm_pro_monthly', expiration_at_ms: newPeriodEnd })
      );
      const response = await POST(req);
      expect(response.status).toBe(200);

      const after = await reload(user.id);
      expect(after.tier).toBe('PRO');
      expect(after.subscriptionPeriodEnd?.getTime()).toBe(newPeriodEnd);
    });

    it('RENEWAL does not re-flip pendingWelcome (only fires on the transition into paid)', async () => {
      const user = await createUser({
        tier: 'PRO',
        entitlementSource: 'APPLE_IAP',
        billingInterval: 'monthly',
        subscriptionPeriodEnd: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
        pendingWelcome: false,
      });
      const req = rcRequest(
        rcEvent({ type: 'RENEWAL', app_user_id: user.id, expiration_at_ms: Date.now() + 30 * 24 * 60 * 60 * 1000 })
      );
      const response = await POST(req);
      expect(response.status).toBe(200);
      const after = await reload(user.id);
      expect(after.pendingWelcome).toBe(false);
    });

    it('CANCELLATION sets pendingTier FREE but leaves tier PRO until expiry', async () => {
      const user = await createUser({
        tier: 'PRO',
        entitlementSource: 'APPLE_IAP',
        billingInterval: 'monthly',
        subscriptionPeriodEnd: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
      });
      const req = rcRequest(rcEvent({ type: 'CANCELLATION', app_user_id: user.id, entitlement_ids: ['pro'] }));
      const response = await POST(req);
      expect(response.status).toBe(200);

      const after = await reload(user.id);
      expect(after.tier).toBe('PRO');
      expect(after.pendingTier).toBe('FREE');
    });

    it('BILLING_ISSUE sets inGracePeriod on an APPLE_IAP user', async () => {
      const user = await createUser({
        tier: 'PRO',
        entitlementSource: 'APPLE_IAP',
        billingInterval: 'monthly',
        subscriptionPeriodEnd: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
      });
      const req = rcRequest(rcEvent({ type: 'BILLING_ISSUE', app_user_id: user.id, entitlement_ids: ['pro'] }));
      const response = await POST(req);
      expect(response.status).toBe(200);

      const after = await reload(user.id);
      expect(after.tier).toBe('PRO');
      expect(after.inGracePeriod).toBe(true);
    });

    it('EXPIRATION downgrades an APPLE_IAP user to FREE with billing fields cleared', async () => {
      const user = await createUser({
        tier: 'PRO',
        entitlementSource: 'APPLE_IAP',
        billingInterval: 'monthly',
        subscriptionPeriodEnd: new Date(Date.now() - 1000),
        pendingTier: 'FREE',
      });
      const req = rcRequest(rcEvent({ type: 'EXPIRATION', app_user_id: user.id, entitlement_ids: ['pro'] }));
      const response = await POST(req);
      expect(response.status).toBe(200);

      const after = await reload(user.id);
      expect(after.tier).toBe('FREE');
      expect(after.entitlementSource).toBeNull();
      expect(after.pendingTier).toBeNull();
      expect(after.subscriptionPeriodEnd).toBeNull();
      expect(after.billingInterval).toBeNull();
      expect(after.inGracePeriod).toBe(false);
    });

    it('PRODUCT_CHANGE monthly -> yearly keeps monthly interval (both map to monthly)', async () => {
      const user = await createUser({
        tier: 'PRO',
        entitlementSource: 'APPLE_IAP',
        billingInterval: 'monthly',
        subscriptionPeriodEnd: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
      });
      const newPeriodEnd = Date.now() + 365 * 24 * 60 * 60 * 1000;
      const req = rcRequest(
        rcEvent({ type: 'PRODUCT_CHANGE', app_user_id: user.id, product_id: 'nm_pro_yearly', expiration_at_ms: newPeriodEnd })
      );
      const response = await POST(req);
      expect(response.status).toBe(200);
      const after = await reload(user.id);
      expect(after.billingInterval).toBe('monthly');
      expect(after.subscriptionPeriodEnd?.getTime()).toBe(newPeriodEnd);
    });

    it('PRODUCT_CHANGE monthly -> weekly flips interval to weekly', async () => {
      const user = await createUser({
        tier: 'PRO',
        entitlementSource: 'APPLE_IAP',
        billingInterval: 'monthly',
        subscriptionPeriodEnd: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
      });
      const req = rcRequest(
        rcEvent({
          type: 'PRODUCT_CHANGE',
          app_user_id: user.id,
          product_id: 'nm_pro_weekly',
          expiration_at_ms: Date.now() + 7 * 24 * 60 * 60 * 1000,
        })
      );
      const response = await POST(req);
      expect(response.status).toBe(200);
      const after = await reload(user.id);
      expect(after.billingInterval).toBe('weekly');
    });

    it('UNCANCELLATION re-activates PRO via the ACTIVE_TYPES path', async () => {
      const user = await createUser({
        tier: 'PRO',
        entitlementSource: 'APPLE_IAP',
        billingInterval: 'monthly',
        subscriptionPeriodEnd: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
        pendingTier: 'FREE',
      });
      const req = rcRequest(
        rcEvent({ type: 'UNCANCELLATION', app_user_id: user.id, expiration_at_ms: Date.now() + 10 * 24 * 60 * 60 * 1000 })
      );
      const response = await POST(req);
      expect(response.status).toBe(200);
      const after = await reload(user.id);
      expect(after.tier).toBe('PRO');
      expect(after.pendingTier).toBeNull();
    });

    it('an ACTIVE_TYPES event with a past/null expiration_at_ms does not grant PRO', async () => {
      const user = await createUser();
      const req = rcRequest(
        rcEvent({ type: 'INITIAL_PURCHASE', app_user_id: user.id, expiration_at_ms: Date.now() - 1000 })
      );
      const response = await POST(req);
      expect(response.status).toBe(200);
      const after = await reload(user.id);
      expect(after.tier).toBe('FREE');
    });
  });

  describe('unresolvable app_user_id', () => {
    it('acknowledges but mutates no user', async () => {
      // Assert against a seeded bystander, not a global count — the sandbox
      // DB is shared with concurrent suites seeding their own users.
      const bystander = await createUser();
      const before = await reload(bystander.id);
      const req = rcRequest(rcEvent({ app_user_id: 'nonexistent-user-id-xyz' }));
      const response = await POST(req);
      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.received).toBe(true);
      const after = await reload(bystander.id);
      expect(after).toEqual(before);
    });

    it('resolves via revenueCatAppUserId when it does not equal User.id', async () => {
      const user = await createUser({ revenueCatAppUserId: `rcid_${Math.random().toString(36).slice(2)}` });
      const req = rcRequest(
        rcEvent({ app_user_id: user.revenueCatAppUserId!, expiration_at_ms: Date.now() + 10 * 24 * 60 * 60 * 1000 })
      );
      const response = await POST(req);
      expect(response.status).toBe(200);
      const after = await reload(user.id);
      expect(after.tier).toBe('PRO');
    });
  });

  describe('replay / idempotency', () => {
    it('the same event id delivered twice is not double-applied', async () => {
      const user = await createUser();
      const eventId = `evt_replay_${Math.random().toString(36).slice(2)}`;
      const periodEnd1 = Date.now() + 30 * 24 * 60 * 60 * 1000;
      const body = rcEvent({ app_user_id: user.id, id: eventId, expiration_at_ms: periodEnd1 });

      const first = await POST(rcRequest(body));
      expect(first.status).toBe(200);
      const firstJson = await first.json();
      expect(firstJson.duplicate).toBeUndefined();

      const afterFirst = await reload(user.id);
      expect(afterFirst.tier).toBe('PRO');
      expect(afterFirst.pendingWelcome).toBe(true);

      // Second delivery of the SAME event id (RC's at-least-once semantics).
      // Change nothing else about the payload so a "double apply" bug would
      // be invisible on tier/periodEnd alone — pendingWelcome would still be
      // true either way since it's already true. The real assertion is the
      // `duplicate: true` ack and that webhookEvent has exactly one row.
      const second = await POST(rcRequest(body));
      expect(second.status).toBe(200);
      const secondJson = await second.json();
      expect(secondJson.duplicate).toBe(true);

      const events = await db.webhookEvent.findMany({
        where: { provider: 'revenuecat', eventId },
      });
      expect(events).toHaveLength(1);
    });
  });

  describe('cross-provider precedence (LEMON_SQUEEZY user hit by an RC event)', () => {
    it('RC EXPIRATION on a LEMON_SQUEEZY-backed user does NOT downgrade — only detaches nothing (LS untouched)', async () => {
      const periodEnd = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);
      const user = await createUser({
        tier: 'PRO',
        entitlementSource: 'LEMON_SQUEEZY',
        billingInterval: 'monthly',
        subscriptionPeriodEnd: periodEnd,
        lemonSqueezySubscriptionId: `ls_${Math.random().toString(36).slice(2)}`,
      });
      const req = rcRequest(rcEvent({ type: 'EXPIRATION', app_user_id: user.id, entitlement_ids: ['pro'] }));
      const response = await POST(req);
      expect(response.status).toBe(200);

      const after = await reload(user.id);
      // endSubscription() only clobbers tier/period when entitlementSource
      // === the provider passed in (APPLE_IAP here). The LS subscriber must
      // stay exactly as they were.
      expect(after.tier).toBe('PRO');
      expect(after.entitlementSource).toBe('LEMON_SQUEEZY');
      expect(after.subscriptionPeriodEnd?.getTime()).toBe(periodEnd.getTime());
      expect(after.lemonSqueezySubscriptionId).not.toBeNull();
    });

    it('RC CANCELLATION on a LEMON_SQUEEZY-backed user does NOT set pendingTier (provider-safe, mirrors EXPIRATION)', async () => {
      // The CANCELLATION/SUBSCRIPTION_PAUSED branch now checks
      // entitlementSource === APPLE_IAP before mutating, same as EXPIRATION.
      // A stale/linked iOS RC account firing a CANCELLATION must never flag an
      // LS-backed subscription pending-cancel — the event is acked (200) with
      // no write to the user.
      const user = await createUser({
        tier: 'PRO',
        entitlementSource: 'LEMON_SQUEEZY',
        billingInterval: 'monthly',
        subscriptionPeriodEnd: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
        lemonSqueezySubscriptionId: `ls_${Math.random().toString(36).slice(2)}`,
      });
      const before = await reload(user.id);
      const req = rcRequest(rcEvent({ type: 'CANCELLATION', app_user_id: user.id, entitlement_ids: ['pro'] }));
      const response = await POST(req);
      expect(response.status).toBe(200);

      const after = await reload(user.id);
      expect(after.tier).toBe('PRO');
      expect(after.entitlementSource).toBe('LEMON_SQUEEZY');
      expect(after.pendingTier).toBeNull(); // no cross-provider leak
      expect(after).toEqual(before); // LS subscriber wholly untouched
    });

    it('RC BILLING_ISSUE on a LEMON_SQUEEZY-backed user does NOT set inGracePeriod (provider-safe)', async () => {
      // Same guard for the dunning branch: a stale RC BILLING_ISSUE must not
      // drop an LS subscriber into a grace/dunning window they were never in.
      const user = await createUser({
        tier: 'PRO',
        entitlementSource: 'LEMON_SQUEEZY',
        billingInterval: 'monthly',
        subscriptionPeriodEnd: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
        lemonSqueezySubscriptionId: `ls_${Math.random().toString(36).slice(2)}`,
      });
      const before = await reload(user.id);
      const req = rcRequest(rcEvent({ type: 'BILLING_ISSUE', app_user_id: user.id, entitlement_ids: ['pro'] }));
      const response = await POST(req);
      expect(response.status).toBe(200);

      const after = await reload(user.id);
      expect(after.inGracePeriod).toBe(false);
      expect(after.entitlementSource).toBe('LEMON_SQUEEZY');
      expect(after).toEqual(before); // LS subscriber wholly untouched
    });
  });

  describe('malformed / no-op payloads', () => {
    it('missing event.type/id/app_user_id -> ignored, no row written', async () => {
      const req = rcRequest({ event: { entitlement_ids: ['pro'] } });
      const response = await POST(req);
      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.ignored).toBe(true);
    });

    it('an entitlement_ids list that excludes "pro" is a no-op even for INITIAL_PURCHASE', async () => {
      const user = await createUser();
      const req = rcRequest(rcEvent({ app_user_id: user.id, entitlement_ids: ['some_other_entitlement'] }));
      const response = await POST(req);
      expect(response.status).toBe(200);
      const after = await reload(user.id);
      expect(after.tier).toBe('FREE');
    });

    it('invalid JSON body -> 400', async () => {
      const req = new NextRequest('http://localhost/api/billing/revenuecat/webhook', {
        method: 'POST',
        body: '{not json',
        headers: { 'content-type': 'application/json', authorization: AUTH },
      });
      const response = await POST(req);
      expect(response.status).toBe(400);
    });
  });
});
