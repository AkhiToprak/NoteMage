// Lemon Squeezy webhook subscription-lifecycle integration suite. Runs the
// REAL route handler against the REAL sandbox Postgres (no db/lemonsqueezy/
// entitlement mocks) — see sandbox.ts for the self-skip gate. Env must be set
// before any app module import, since some libs read env at import time.
import { SANDBOX_BILLING_ENV } from './sandbox';
Object.assign(process.env, SANDBOX_BILLING_ENV);

import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import { NextRequest } from 'next/server';
import { sandboxDescribe } from './sandbox';
import { db } from '@/lib/db';
import { deriveAccountState, resolveActiveEntitlement } from '@/lib/entitlement';
import { POST } from '../../../../app/api/billing/lemonsqueezy/webhook/route';

const SECRET = SANDBOX_BILLING_ENV.LEMONSQUEEZY_WEBHOOK_SECRET;

function sign(body: string, secret = SECRET): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function callPost(body: string) {
  const req = new NextRequest('http://localhost/api/billing/lemonsqueezy/webhook', {
    method: 'POST',
    body,
    headers: { 'content-type': 'application/json', 'x-signature': sign(body) },
  });
  return POST(req);
}

/** Build a webhook payload. `userId` populates meta.custom_data.user_id (the
 *  primary resolution path); omit to exercise other resolution paths. */
function payload(opts: {
  event: string;
  subId: string;
  variantId: number | string;
  customerId?: string | number;
  status?: string;
  renewsAt?: string | null;
  endsAt?: string | null;
  updatedAt?: string;
  userId?: string;
  omitAttrs?: boolean;
}): string {
  const {
    event,
    subId,
    variantId,
    customerId = `cust-${subId}`,
    status = 'active',
    renewsAt = '2026-08-01T00:00:00Z',
    endsAt = null,
    updatedAt = '2026-07-01T00:00:00Z',
    userId,
    omitAttrs = false,
  } = opts;
  return JSON.stringify({
    meta: {
      event_name: event,
      custom_data: userId ? { user_id: userId } : {},
    },
    data: {
      id: subId,
      attributes: omitAttrs
        ? undefined
        : {
            customer_id: customerId,
            variant_id: variantId,
            status,
            renews_at: renewsAt,
            ends_at: endsAt,
            updated_at: updatedAt,
            urls: { customer_portal: `https://ls.test/portal/${subId}` },
          },
    },
  });
}

let seq = 0;
// Per-process run tag so re-running this file doesn't collide with rows a
// previous run left behind (email/username are both @unique).
const RUN_TAG = Math.random().toString(36).slice(2, 8);

/** Unique per-test user in our reserved namespace (ls-<case>@sandbox.test).
 *  username is capped at 20 chars, so uniqueness rides on `seq` alone —
 *  slicing a distinguishing case-name prefix risks collisions once two case
 *  names share a 20-char prefix (e.g. two "planchange-102-*" cases did). */
async function makeUser(caseName: string, extra: Record<string, unknown> = {}) {
  seq += 1;
  return db.user.create({
    data: {
      email: `ls-${caseName}-${RUN_TAG}-${seq}@sandbox.test`,
      username: `ls_${RUN_TAG}_${seq}`,
      ...extra,
    },
  });
}

sandboxDescribe('POST /api/billing/lemonsqueezy/webhook — subscription lifecycle', () => {
  beforeEach(async () => {
    // Nothing global to reset — every row is scoped to its own ls-<case>@sandbox.test user.
  });

  describe('subscription_created — variant → tier/interval mapping', () => {
    it('variant 102 (monthly) promotes to PRO, monthly interval, persists LS ids', async () => {
      const user = await makeUser('created-monthly');
      const subId = `sub-${user.id}`;
      const body = payload({
        event: 'subscription_created',
        subId,
        variantId: 102,
        customerId: `cust-${user.id}`,
        userId: user.id,
        renewsAt: '2026-08-06T00:00:00Z',
      });

      const res = await callPost(body);
      expect(res.status).toBe(200);

      const row = await db.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(row.tier).toBe('PRO');
      expect(row.billingInterval).toBe('monthly');
      expect(row.entitlementSource).toBe('LEMON_SQUEEZY');
      expect(row.lemonSqueezyCustomerId).toBe(`cust-${user.id}`);
      expect(row.lemonSqueezySubscriptionId).toBe(subId);
      expect(row.subscriptionPeriodEnd?.toISOString()).toBe('2026-08-06T00:00:00.000Z');
      expect(row.pendingWelcome).toBe(true);

      expect(deriveAccountState(row)).toBe('active');
      expect(resolveActiveEntitlement(row)).toMatchObject({
        tier: 'PRO',
        source: 'LEMON_SQUEEZY',
        inGracePeriod: false,
      });
    });

    it('variant 103 (yearly) promotes to PRO, yearly interval', async () => {
      const user = await makeUser('created-yearly');
      const subId = `sub-${user.id}`;
      const body = payload({
        event: 'subscription_created',
        subId,
        variantId: 103,
        userId: user.id,
      });

      await callPost(body);
      const row = await db.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(row.tier).toBe('PRO');
      expect(row.billingInterval).toBe('monthly'); // yearly is quota-identical to monthly (see intervalFromLemonSqueezyVariantId)
    });

    it('variant 101 (weekly) promotes to PRO, weekly interval', async () => {
      const user = await makeUser('created-weekly');
      const subId = `sub-${user.id}`;
      const body = payload({ event: 'subscription_created', subId, variantId: 101, userId: user.id });

      await callPost(body);
      const row = await db.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(row.tier).toBe('PRO');
      expect(row.billingInterval).toBe('weekly');
    });

    it('variant 201 (weekly PPP twin) promotes to PRO, weekly interval', async () => {
      const user = await makeUser('created-ppp-weekly');
      const subId = `sub-${user.id}`;
      const body = payload({ event: 'subscription_created', subId, variantId: 201, userId: user.id });

      await callPost(body);
      const row = await db.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(row.tier).toBe('PRO');
      expect(row.billingInterval).toBe('weekly');
      expect(row.entitlementSource).toBe('LEMON_SQUEEZY');
    });
  });

  describe('user resolution paths', () => {
    it('resolves via custom_data.user_id (primary path)', async () => {
      const user = await makeUser('resolve-customdata');
      const body = payload({
        event: 'subscription_created',
        subId: `sub-${user.id}`,
        variantId: 102,
        userId: user.id,
      });
      await callPost(body);
      const row = await db.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(row.tier).toBe('PRO');
    });

    it('resolves via existing lemonSqueezyCustomerId when custom_data is absent', async () => {
      const custId = `cust-fallback-${RUN_TAG}`;
      const user = await makeUser('resolve-customerid', {
        lemonSqueezyCustomerId: custId,
      });
      const body = payload({
        event: 'subscription_updated',
        subId: `sub-${user.id}`,
        variantId: 102,
        customerId: custId,
        // no userId → custom_data.user_id absent, forcing the customerId path
      });
      await callPost(body);
      const row = await db.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(row.tier).toBe('PRO');
      expect(row.lemonSqueezySubscriptionId).toBe(`sub-${user.id}`);
    });

    it('resolves via existing lemonSqueezySubscriptionId when neither user_id nor customerId match', async () => {
      // customerId must be run-unique: applySubscriptionState() persists
      // sub.customerId onto whichever user it resolves, so a fixed literal
      // here would self-collide on the NEXT run of this file — that run's
      // resolveLemonSqueezyUserId() customerId lookup would match THIS run's
      // leftover row and silently short-circuit before ever reaching the
      // bySub fallback this test exists to exercise.
      const subId = `sub-bysubid-${RUN_TAG}`;
      const user = await makeUser('resolve-bysubid', {
        lemonSqueezySubscriptionId: subId,
      });
      const body = payload({
        event: 'subscription_updated',
        subId,
        variantId: 103,
        customerId: `cust-does-not-match-anyone-${RUN_TAG}`,
        // no userId, and customerId is unbound — only the bySub fallback in
        // resolveUserId() (webhook route.ts) can find this user.
      });
      await callPost(body);
      const row = await db.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(row.tier).toBe('PRO');
      expect(row.billingInterval).toBe('monthly');
    });

    it('unresolvable user: acknowledged 200, no user mutated, no crash', async () => {
      const bystander = await makeUser('resolve-bystander');
      const body = payload({
        event: 'subscription_created',
        subId: `sub-orphan-${Date.now()}`,
        variantId: 102,
        customerId: 'cust-nobody-owns-this',
        // no userId, no matching customerId/subscriptionId anywhere
      });

      const res = await callPost(body);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.received).toBe(true);

      const bystanderRow = await db.user.findUniqueOrThrow({ where: { id: bystander.id } });
      expect(bystanderRow.tier).toBe('FREE'); // untouched
    });
  });

  describe('mid-trial conversion', () => {
    it('subscription_created for a trialing user clears trialEndsAt and grants PRO', async () => {
      const futureTrialEnd = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000); // 3 days out, within the 30-day sandbox window
      const user = await makeUser('trial-convert', {
        tier: 'PRO',
        billingInterval: 'weekly',
        trialEndsAt: futureTrialEnd,
        entitlementSource: null,
      });
      expect(deriveAccountState(user)).toBe('trialing');

      const body = payload({
        event: 'subscription_created',
        subId: `sub-${user.id}`,
        variantId: 102,
        userId: user.id,
      });
      await callPost(body);

      const row = await db.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(row.trialEndsAt).toBeNull();
      expect(row.tier).toBe('PRO');
      expect(row.entitlementSource).toBe('LEMON_SQUEEZY');
      expect(row.billingInterval).toBe('monthly'); // paid plan interval overrides the trial's weekly
      expect(row.pendingWelcome).toBe(true); // trial→paid is a conversion, not a renewal
      expect(deriveAccountState(row)).toBe('active');
    });
  });

  describe('subscription_updated', () => {
    it('renewal: same variant, renews_at moves forward, pendingWelcome NOT re-set', async () => {
      const subId = `sub-renewal-${RUN_TAG}`;
      const custId = `cust-renewal-${RUN_TAG}`;
      const user = await makeUser('renewal', {
        tier: 'PRO',
        entitlementSource: 'LEMON_SQUEEZY',
        billingInterval: 'monthly',
        lemonSqueezySubscriptionId: subId,
        lemonSqueezyCustomerId: custId,
        subscriptionPeriodEnd: new Date('2026-07-01T00:00:00Z'),
      });

      const body = payload({
        event: 'subscription_updated',
        subId,
        variantId: 102,
        customerId: custId,
        userId: user.id,
        renewsAt: '2026-08-01T00:00:00Z',
      });
      await callPost(body);

      const row = await db.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(row.subscriptionPeriodEnd?.toISOString()).toBe('2026-08-01T00:00:00.000Z');
      expect(row.pendingWelcome).toBe(false); // already active → not a conversion, no replay of the welcome screen
    });

    it('plan change 102 -> 103: billingInterval stays monthly (both non-weekly)', async () => {
      const subId = `sub-pc1-${RUN_TAG}`;
      const custId = `cust-pc1-${RUN_TAG}`;
      const user = await makeUser('planchange-102-103', {
        tier: 'PRO',
        entitlementSource: 'LEMON_SQUEEZY',
        billingInterval: 'monthly',
        lemonSqueezySubscriptionId: subId,
        lemonSqueezyCustomerId: custId,
      });
      const body = payload({
        event: 'subscription_updated',
        subId,
        variantId: 103,
        customerId: custId,
        userId: user.id,
      });
      await callPost(body);
      const row = await db.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(row.billingInterval).toBe('monthly');
    });

    it('plan change 102 -> 101: billingInterval flips to weekly', async () => {
      const subId = `sub-pc2-${RUN_TAG}`;
      const custId = `cust-pc2-${RUN_TAG}`;
      const user = await makeUser('planchange-102-101', {
        tier: 'PRO',
        entitlementSource: 'LEMON_SQUEEZY',
        billingInterval: 'monthly',
        lemonSqueezySubscriptionId: subId,
        lemonSqueezyCustomerId: custId,
      });
      const body = payload({
        event: 'subscription_updated',
        subId,
        variantId: 101,
        customerId: custId,
        userId: user.id,
      });
      await callPost(body);
      const row = await db.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(row.billingInterval).toBe('weekly');
    });

    it('status past_due: flips inGracePeriod, keeps tier PRO', async () => {
      const subId = `sub-pd1-${RUN_TAG}`;
      const custId = `cust-pd1-${RUN_TAG}`;
      const user = await makeUser('pastdue', {
        tier: 'PRO',
        entitlementSource: 'LEMON_SQUEEZY',
        lemonSqueezySubscriptionId: subId,
        lemonSqueezyCustomerId: custId,
      });
      const body = payload({
        event: 'subscription_updated',
        subId,
        variantId: 102,
        customerId: custId,
        userId: user.id,
        status: 'past_due',
      });
      await callPost(body);
      const row = await db.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(row.tier).toBe('PRO');
      expect(row.inGracePeriod).toBe(true);
      expect(deriveAccountState(row)).toBe('active'); // dunning intentionally NOT gated
    });

    it('status unpaid: same grace treatment as past_due', async () => {
      const subId = `sub-up1-${RUN_TAG}`;
      const custId = `cust-up1-${RUN_TAG}`;
      const user = await makeUser('unpaid', {
        tier: 'PRO',
        entitlementSource: 'LEMON_SQUEEZY',
        lemonSqueezySubscriptionId: subId,
        lemonSqueezyCustomerId: custId,
      });
      const body = payload({
        event: 'subscription_updated',
        subId,
        variantId: 102,
        customerId: custId,
        userId: user.id,
        status: 'unpaid',
      });
      await callPost(body);
      const row = await db.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(row.tier).toBe('PRO');
      expect(row.inGracePeriod).toBe(true);
    });

    it('status paused: downgrades to FREE via endSubscription (own provider)', async () => {
      const subId = `sub-pause1-${RUN_TAG}`;
      const custId = `cust-pause1-${RUN_TAG}`;
      const user = await makeUser('paused-status', {
        tier: 'PRO',
        entitlementSource: 'LEMON_SQUEEZY',
        lemonSqueezySubscriptionId: subId,
        lemonSqueezyCustomerId: custId,
        subscriptionPeriodEnd: new Date('2026-08-01T00:00:00Z'),
      });
      const body = payload({
        event: 'subscription_updated',
        subId,
        variantId: 102,
        customerId: custId,
        userId: user.id,
        status: 'paused',
      });
      await callPost(body);
      const row = await db.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(row.tier).toBe('FREE');
      expect(row.entitlementSource).toBeNull();
      expect(row.subscriptionPeriodEnd).toBeNull();
      expect(row.lemonSqueezySubscriptionId).toBeNull();
      expect(deriveAccountState(row)).toBe('expired');
    });
  });

  describe('subscription_cancelled — grace period until ends_at', () => {
    it('cancelled keeps user PRO with pendingTier FREE until ends_at', async () => {
      const subId = `sub-cancel1-${RUN_TAG}`;
      const custId = `cust-cancel1-${RUN_TAG}`;
      const user = await makeUser('cancelled-grace', {
        tier: 'PRO',
        entitlementSource: 'LEMON_SQUEEZY',
        lemonSqueezySubscriptionId: subId,
        lemonSqueezyCustomerId: custId,
      });
      const body = payload({
        event: 'subscription_cancelled',
        subId,
        variantId: 102,
        customerId: custId,
        userId: user.id,
        status: 'cancelled',
        endsAt: '2026-08-15T00:00:00Z',
        renewsAt: null,
      });
      await callPost(body);
      const row = await db.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(row.tier).toBe('PRO'); // still active until ends_at
      expect(row.pendingTier).toBe('FREE');
      expect(row.subscriptionPeriodEnd?.toISOString()).toBe('2026-08-15T00:00:00.000Z');
      expect(deriveAccountState(row)).toBe('active');
    });
  });

  describe('subscription_expired — downgrade via endSubscription', () => {
    it('expired drops tier to FREE and clears the exact fields endSubscription() specifies', async () => {
      const subId = `sub-expired1-${RUN_TAG}`;
      const custId = `cust-expired1-${RUN_TAG}`;
      const user = await makeUser('expired', {
        tier: 'PRO',
        entitlementSource: 'LEMON_SQUEEZY',
        billingInterval: 'monthly',
        lemonSqueezySubscriptionId: subId,
        lemonSqueezyCustomerId: custId,
        subscriptionPeriodEnd: new Date('2026-07-01T00:00:00Z'),
        inGracePeriod: true,
        pendingTier: 'FREE',
      });
      const body = payload({
        event: 'subscription_expired',
        subId,
        variantId: 102,
        customerId: custId,
        userId: user.id,
        status: 'expired',
      });
      await callPost(body);
      const row = await db.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(row.tier).toBe('FREE');
      expect(row.entitlementSource).toBeNull();
      expect(row.pendingTier).toBeNull();
      expect(row.subscriptionPeriodEnd).toBeNull();
      expect(row.inGracePeriod).toBe(false);
      expect(row.billingInterval).toBeNull();
      expect(row.lemonSqueezySubscriptionId).toBeNull(); // LS-specific id cleared
      expect(row.lemonSqueezyCustomerId).toBe(custId); // customer record retained for re-subscribe
      expect(deriveAccountState(row)).toBe('expired');
    });

    it('expired from a NON-backing provider only detaches the sub id, does not touch tier (cross-channel safety)', async () => {
      const subId = `sub-stale-ls-${RUN_TAG}`;
      const custId = `cust-stale-ls-${RUN_TAG}`;
      const user = await makeUser('expired-crosschannel', {
        tier: 'PRO',
        entitlementSource: 'APPLE_IAP', // Apple is the active source, not LS
        lemonSqueezySubscriptionId: subId,
        lemonSqueezyCustomerId: custId,
        subscriptionPeriodEnd: new Date('2026-09-01T00:00:00Z'),
      });
      const body = payload({
        event: 'subscription_expired',
        subId,
        variantId: 102,
        customerId: custId,
        userId: user.id,
        status: 'expired',
      });
      await callPost(body);
      const row = await db.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(row.tier).toBe('PRO'); // untouched — Apple is still backing it
      expect(row.entitlementSource).toBe('APPLE_IAP');
      expect(row.subscriptionPeriodEnd?.toISOString()).toBe('2026-09-01T00:00:00.000Z');
      expect(row.lemonSqueezySubscriptionId).toBeNull(); // only its own dead id is detached
    });
  });

  describe('subscription_resumed', () => {
    it('resumed re-activates PRO (treated as an active status → provision)', async () => {
      const subId = `sub-resume1-${RUN_TAG}`;
      const custId = `cust-resume1-${RUN_TAG}`;
      const user = await makeUser('resumed', {
        tier: 'PRO',
        entitlementSource: 'LEMON_SQUEEZY',
        lemonSqueezySubscriptionId: subId,
        lemonSqueezyCustomerId: custId,
        pendingTier: 'FREE', // was scheduled to cancel
      });
      const body = payload({
        event: 'subscription_resumed',
        subId,
        variantId: 102,
        customerId: custId,
        userId: user.id,
        status: 'active',
        renewsAt: '2026-09-01T00:00:00Z',
      });
      await callPost(body);
      const row = await db.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(row.tier).toBe('PRO');
      expect(row.pendingTier).toBeNull(); // activeGrant() clears the scheduled cancellation
      expect(row.subscriptionPeriodEnd?.toISOString()).toBe('2026-09-01T00:00:00.000Z');
    });
  });

  describe('unknown variant / malformed payloads — no state change', () => {
    it('unknown variant id (999, not in LEMONSQUEEZY_PRO_VARIANT_IDS): webhook 200s, user NOT provisioned', async () => {
      const user = await makeUser('unknown-variant');
      const body = payload({
        event: 'subscription_created',
        subId: `sub-${user.id}`,
        variantId: 999,
        userId: user.id,
      });
      const res = await callPost(body);
      expect(res.status).toBe(200);
      const row = await db.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(row.tier).toBe('FREE');
      expect(row.entitlementSource).toBeNull();
      expect(row.lemonSqueezySubscriptionId).toBeNull();
    });

    it('missing attributes: acknowledged + ignored, no crash, no webhook_events row (never reached idempotency claim)', async () => {
      const subId = `sub-malformed-${Date.now()}`;
      const body = payload({
        event: 'subscription_created',
        subId,
        variantId: 102,
        omitAttrs: true,
      });
      const res = await callPost(body);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toMatchObject({ received: true, ignored: true });

      const events = await db.webhookEvent.findMany({ where: { eventId: { contains: subId } } });
      expect(events).toHaveLength(0);
    });

    it('missing event_name: acknowledged + ignored', async () => {
      const body = JSON.stringify({
        meta: {},
        data: { id: 'sub-noeventname', attributes: { variant_id: 102, status: 'active' } },
      });
      const res = await callPost(body);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toMatchObject({ received: true, ignored: true });
    });

    it('unrecognized event_name (e.g. subscription_payment_success): acknowledged, no provisioning attempted', async () => {
      const user = await makeUser('unrecognized-event');
      const body = payload({
        event: 'subscription_payment_success',
        subId: `sub-${user.id}`,
        variantId: 102,
        userId: user.id,
      });
      const res = await callPost(body);
      expect(res.status).toBe(200);
      const row = await db.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(row.tier).toBe('FREE'); // SUBSCRIPTION_EVENTS gate excludes payment/order events entirely
    });
  });

  describe('idempotency / replay', () => {
    it('the same event (identical name+subId+status+updated_at) sent twice is deduplicated; state not double-applied', async () => {
      const user = await makeUser('idempotent-replay');
      const subId = `sub-${user.id}`;
      const body = payload({
        event: 'subscription_created',
        subId,
        variantId: 102,
        userId: user.id,
        updatedAt: '2026-07-01T12:00:00Z',
      });

      const first = await callPost(body);
      expect(first.status).toBe(200);
      const firstJson = await first.json();
      expect(firstJson.duplicate).toBeUndefined();

      const second = await callPost(body);
      expect(second.status).toBe(200);
      const secondJson = await second.json();
      expect(secondJson.duplicate).toBe(true);

      // Only one webhook_events row for this event id.
      const eventId = `subscription_created:${subId}:active:2026-07-01T12:00:00Z`;
      const events = await db.webhookEvent.findMany({ where: { provider: 'lemonsqueezy', eventId } });
      expect(events).toHaveLength(1);

      // State applied exactly once — periodEnd matches the single application,
      // pendingWelcome true (not somehow toggled twice).
      const row = await db.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(row.tier).toBe('PRO');
      expect(row.pendingWelcome).toBe(true);
    });

    it('a distinct status transition on the same subId+updated_at is NOT masked as a duplicate', async () => {
      // Regression for the eventId design note in route.ts: including `status`
      // in the derived id prevents a same-second terminal transition from
      // colliding with a preceding one.
      const subId = `sub-collide1-${RUN_TAG}`;
      const custId = `cust-collide1-${RUN_TAG}`;
      const user = await makeUser('distinct-status-same-time', {
        tier: 'PRO',
        entitlementSource: 'LEMON_SQUEEZY',
        lemonSqueezySubscriptionId: subId,
        lemonSqueezyCustomerId: custId,
      });
      const sharedUpdatedAt = '2026-07-02T00:00:00Z';

      const activeBody = payload({
        event: 'subscription_updated',
        subId,
        variantId: 102,
        customerId: custId,
        userId: user.id,
        status: 'active',
        updatedAt: sharedUpdatedAt,
      });
      const activeRes = await callPost(activeBody);
      expect((await activeRes.json()).duplicate).toBeUndefined();

      const expiredBody = payload({
        event: 'subscription_updated',
        subId,
        variantId: 102,
        customerId: custId,
        userId: user.id,
        status: 'expired',
        updatedAt: sharedUpdatedAt,
      });
      const expiredRes = await callPost(expiredBody);
      const expiredJson = await expiredRes.json();
      expect(expiredJson.duplicate).toBeUndefined(); // must NOT be deduped against the `active` event

      const row = await db.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(row.tier).toBe('FREE'); // the expired transition landed, not masked
    });
  });
});
