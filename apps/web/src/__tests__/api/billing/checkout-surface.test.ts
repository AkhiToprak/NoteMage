// Checkout surface + non-webhook billing routes + the checkout->webhook
// user-resolution round-trip contract. Env must be set before any app module
// import (see sandbox.ts).
import { SANDBOX_BILLING_ENV } from './sandbox';
Object.assign(process.env, SANDBOX_BILLING_ENV);

// LEMONSQUEEZY_API_KEY isn't part of SANDBOX_BILLING_ENV (webhook suite never
// makes an outbound LS call) but sync/portal/cancel all do via lsHeaders().
process.env.LEMONSQUEEZY_API_KEY = 'sandbox-ls-api-key';
process.env.NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL = 'https://ls.test/buy/generic';
process.env.NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL_WEEKLY = 'https://ls.test/buy/weekly';
process.env.NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL_MONTHLY = 'https://ls.test/buy/monthly';
process.env.NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL_YEARLY = 'https://ls.test/buy/yearly';
process.env.NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL_WEEKLY_PPP = 'https://ls.test/buy/weekly-ppp';
process.env.NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL_MONTHLY_PPP = 'https://ls.test/buy/monthly-ppp';
process.env.NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL_YEARLY_PPP = 'https://ls.test/buy/yearly-ppp';

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { sandboxDescribe } from './sandbox';
import { db } from '@/lib/db';
import { resolveLemonSqueezyUserId } from '@/lib/lemonsqueezy';
import { isPppCurrency } from '@/lib/tiers';

// Single per-process tag reused by every literal that must stay unique across
// reruns against the persistent shared sandbox DB (email, username,
// lemonSqueezySubscriptionId are all @unique columns).
const RUN_TAG = Math.random().toString(36).slice(2, 8);

// ---------------------------------------------------------------------------
// 1. Checkout URL selection (pure logic — openProCheckout, browser-only global
//    script loader) is not exercised; resolveCheckoutUrl itself isn't exported,
//    so we drive it through the exported openProCheckout with `window` stubbed
//    just enough to observe the URL it opens (Url.Open). No jsdom needed —
//    a plain object stands in for `window`/`document`.
// ---------------------------------------------------------------------------
describe('openProCheckout — checkout URL selection', () => {
  let openedUrl: string | null;
  let openProCheckout: typeof import('@/lib/lemonsqueezy-client').openProCheckout;

  beforeEach(async () => {
    vi.resetModules();
    openedUrl = null;

    const fakeWindow: Record<string, unknown> = {
      LemonSqueezy: {
        Setup: () => {},
        Url: { Open: (url: string) => { openedUrl = url; }, Close: () => {} },
      },
    };
    // @ts-expect-error test double
    global.window = fakeWindow;
    // @ts-expect-error test double — loadLemon() short-circuits when
    // window.LemonSqueezy already exists, so document is never touched.
    global.document = { head: { appendChild: () => {} }, createElement: () => ({}) };

    ({ openProCheckout } = await import('@/lib/lemonsqueezy-client'));
  });

  it('weekly interval picks the weekly checkout URL', async () => {
    await openProCheckout({ userId: 'u1', interval: 'weekly' });
    expect(openedUrl).toContain('ls.test/buy/weekly');
    expect(openedUrl).not.toContain('ppp');
  });

  it('monthly interval picks the monthly checkout URL', async () => {
    await openProCheckout({ userId: 'u1', interval: 'monthly' });
    expect(openedUrl).toContain('ls.test/buy/monthly');
  });

  it('yearly interval picks the yearly checkout URL', async () => {
    await openProCheckout({ userId: 'u1', interval: 'yearly' });
    expect(openedUrl).toContain('ls.test/buy/yearly');
  });

  it('ppp=true routes to the dedicated PPP variant for that interval', async () => {
    await openProCheckout({ userId: 'u1', interval: 'monthly', ppp: true });
    expect(openedUrl).toContain('ls.test/buy/monthly-ppp');
  });

  it('ppp=true with no PPP URL configured for that interval falls back to the base interval URL', async () => {
    delete process.env.NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL_YEARLY_PPP;
    vi.resetModules();
    ({ openProCheckout } = await import('@/lib/lemonsqueezy-client'));
    await openProCheckout({ userId: 'u1', interval: 'yearly', ppp: true });
    expect(openedUrl).toContain('ls.test/buy/yearly');
    expect(openedUrl).not.toContain('ppp');
    process.env.NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL_YEARLY_PPP = 'https://ls.test/buy/yearly-ppp';
  });

  it('no interval chosen falls back to the generic product URL', async () => {
    await openProCheckout({ userId: 'u1' });
    expect(openedUrl).toBe('https://ls.test/buy/generic?embed=1&checkout%5Bcustom%5D%5Buser_id%5D=u1');
  });

  it('unset interval-specific URL falls back to the generic product URL', async () => {
    delete process.env.NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL_WEEKLY;
    vi.resetModules();
    ({ openProCheckout } = await import('@/lib/lemonsqueezy-client'));
    await openProCheckout({ userId: 'u1', interval: 'weekly' });
    expect(openedUrl).toContain('ls.test/buy/generic');
    process.env.NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL_WEEKLY = 'https://ls.test/buy/weekly';
  });

  it('throws when even the generic checkout URL is unset', async () => {
    const saved = process.env.NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL;
    delete process.env.NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL;
    delete process.env.NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL_WEEKLY;
    vi.resetModules();
    ({ openProCheckout } = await import('@/lib/lemonsqueezy-client'));
    await expect(openProCheckout({ userId: 'u1', interval: 'weekly' })).rejects.toThrow(
      'NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL is not set'
    );
    process.env.NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL = saved;
    process.env.NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL_WEEKLY = 'https://ls.test/buy/weekly';
  });

  it('appends checkout[custom][user_id] and checkout[email] as query params, embed=1', async () => {
    await openProCheckout({ userId: 'user-abc-123', email: 'x@y.test', interval: 'monthly' });
    const url = new URL(openedUrl!);
    expect(url.searchParams.get('embed')).toBe('1');
    expect(url.searchParams.get('checkout[custom][user_id]')).toBe('user-abc-123');
    expect(url.searchParams.get('checkout[email]')).toBe('x@y.test');
  });

  it('omits checkout[email] when no email is passed', async () => {
    await openProCheckout({ userId: 'user-abc-123', interval: 'monthly' });
    const url = new URL(openedUrl!);
    expect(url.searchParams.has('checkout[email]')).toBe(false);
  });
});

describe('PPP eligibility (isPppCurrency) — decided by IP-resolved display currency', () => {
  // useCurrency() -> GET /api/currency -> resolves the visitor's currency from
  // IP/geo (server-side), cached in localStorage; NOT a country code check in
  // client code. isPppCurrency is the pure branch condition consuming that
  // currency. INR/BRL/TRY are the only PPP-configured currencies (tiers.ts).
  it.each(['INR', 'BRL', 'TRY'])('%s is PPP-eligible', (currency) => {
    expect(isPppCurrency(currency)).toBe(true);
  });

  it.each(['CHF', 'USD', 'EUR', 'GBP', undefined])('%s is NOT PPP-eligible', (currency) => {
    expect(isPppCurrency(currency)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. THE CRITICAL ROUND-TRIP CONTRACT: checkout custom-data field name/nesting
//    must match what resolveLemonSqueezyUserId (and the webhook's meta.custom_data
//    read) expects. A mismatch silently orphans every purchase.
// ---------------------------------------------------------------------------
sandboxDescribe('checkout -> webhook user-resolution round trip', () => {
  it('checkout[custom][user_id] query param survives as meta.custom_data.user_id and resolves via resolveLemonSqueezyUserId', async () => {
    const user = await db.user.create({
      data: {
        email: `checkout-roundtrip-${RUN_TAG}@sandbox.test`,
        username: `co_roundtrip_${RUN_TAG}`,
      },
    });

    // Checkout side: build the exact URL openProCheckout constructs.
    const url = new URL('https://ls.test/buy/monthly');
    url.searchParams.set('embed', '1');
    url.searchParams.set('checkout[custom][user_id]', user.id);

    // LS's own convention echoes checkout[custom][X] back as meta.custom_data.X
    // on the webhook delivery — simulate that mapping explicitly so the test
    // documents the contract rather than assuming it silently.
    const customUserId = url.searchParams.get('checkout[custom][user_id]');
    const webhookPayload = {
      meta: { event_name: 'subscription_created', custom_data: { user_id: customUserId } },
    };

    const rawUserId = webhookPayload.meta.custom_data.user_id;
    const resolved = await resolveLemonSqueezyUserId({
      userId: typeof rawUserId === 'string' && rawUserId ? rawUserId : null,
      customerId: null,
    });

    expect(resolved).toBe(user.id);
  });

  it('field-name mismatch (e.g. checkout[custom][userId] instead of user_id) would orphan the purchase', async () => {
    const user = await db.user.create({
      data: {
        email: `checkout-mismatch-${RUN_TAG}@sandbox.test`,
        username: `co_mismatch_${RUN_TAG}`,
      },
    });

    // Simulates a hypothetical regression: wrong key nested in custom_data.
    const webhookPayload = { meta: { custom_data: { userId: user.id } as Record<string, unknown> } };
    const rawUserId = webhookPayload.meta.custom_data.user_id as unknown;

    const resolved = await resolveLemonSqueezyUserId({
      userId: typeof rawUserId === 'string' && rawUserId ? rawUserId : null,
      customerId: null,
    });

    expect(resolved).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 3. /api/billing/lemonsqueezy/sync
// ---------------------------------------------------------------------------
const authMocks = vi.hoisted(() => ({ getAuthUserId: vi.fn() }));
vi.mock('@/lib/auth', () => ({ getAuthUserId: authMocks.getAuthUserId }));

const fetchMock = vi.fn();

function lsSubscriptionResponse(opts: {
  id: string;
  variantId: number | string;
  status?: string;
  customerId?: string;
  renewsAt?: string | null;
  customUserId?: string | null;
  portalUrl?: string | null;
}) {
  const {
    id,
    variantId,
    status = 'active',
    customerId = `cust-${id}`,
    renewsAt = '2026-08-01T00:00:00Z',
    customUserId = null,
    portalUrl = `https://ls.test/portal/${id}`,
  } = opts;
  return {
    ok: true,
    json: async () => ({
      data: {
        id,
        attributes: {
          customer_id: customerId,
          variant_id: variantId,
          status,
          renews_at: renewsAt,
          ends_at: null,
          updated_at: '2026-07-01T00:00:00Z',
          urls: { customer_portal: portalUrl },
        },
      },
      meta: customUserId ? { custom_data: { user_id: customUserId } } : {},
    }),
  };
}

sandboxDescribe('POST /api/billing/lemonsqueezy/sync', () => {
  let POST: typeof import('../../../../../app/api/billing/lemonsqueezy/sync/route').POST;
  let seq = 0;
  const RUN_TAG = Math.random().toString(36).slice(2, 8);

  async function makeUser(extra: Record<string, unknown> = {}) {
    seq += 1;
    return db.user.create({
      data: {
        email: `checkout-sync-${RUN_TAG}-${seq}@sandbox.test`,
        username: `co_sync_${RUN_TAG}_${seq}`,
        ...extra,
      },
    });
  }

  function callPost(body: unknown) {
    return POST(
      new NextRequest('http://localhost/api/billing/lemonsqueezy/sync', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json' },
      })
    );
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
    ({ POST } = await import('../../../../../app/api/billing/lemonsqueezy/sync/route'));
  });

  it('401 when unauthenticated, no db effect and no outbound LS call', async () => {
    authMocks.getAuthUserId.mockResolvedValueOnce(null);
    const user = await makeUser();

    const res = await callPost({ subscriptionId: 'sub-1' });

    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
    const unchanged = await db.user.findUnique({ where: { id: user.id } });
    expect(unchanged?.tier).toBe('FREE');
  });

  it('promotes the caller to PRO and persists interval/subscription/customer ids when the fetched subscription belongs to them (custom_data.user_id match)', async () => {
    const user = await makeUser();
    authMocks.getAuthUserId.mockResolvedValueOnce(user.id);
    const subId = `sub-sync-${RUN_TAG}`;
    fetchMock.mockResolvedValueOnce(
      lsSubscriptionResponse({ id: subId, variantId: 102, customUserId: user.id })
    );

    const res = await callPost({ subscriptionId: subId });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.tier).toBe('PRO');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(`/subscriptions/${subId}`),
      expect.any(Object)
    );

    const updated = await db.user.findUnique({ where: { id: user.id } });
    expect(updated?.tier).toBe('PRO');
    expect(updated?.billingInterval).toBe('monthly');
    expect(updated?.lemonSqueezySubscriptionId).toBe(subId);
    expect(updated?.lemonSqueezyCustomerId).toBe(`cust-${subId}`);
    expect(updated?.entitlementSource).toBe('LEMON_SQUEEZY');
  });

  it('403 (no provision) when the fetched subscription belongs to a different user — forged subscriptionId cannot be self-synced', async () => {
    const caller = await makeUser();
    const victim = await makeUser();
    const subId = `sub-victim-${RUN_TAG}`;
    authMocks.getAuthUserId.mockResolvedValueOnce(caller.id);
    fetchMock.mockResolvedValueOnce(
      lsSubscriptionResponse({ id: subId, variantId: 102, customUserId: victim.id })
    );

    const res = await callPost({ subscriptionId: subId });

    expect(res.status).toBe(403);
    const unchangedCaller = await db.user.findUnique({ where: { id: caller.id } });
    expect(unchangedCaller?.tier).toBe('FREE');
  });

  it('400 when subscriptionId is missing', async () => {
    const user = await makeUser();
    authMocks.getAuthUserId.mockResolvedValueOnce(user.id);

    const res = await callPost({});

    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 4. GET /api/billing/lemonsqueezy/portal
// ---------------------------------------------------------------------------
sandboxDescribe('GET /api/billing/lemonsqueezy/portal', () => {
  let GET: typeof import('../../../../../app/api/billing/lemonsqueezy/portal/route').GET;
  let seq = 0;
  const RUN_TAG = Math.random().toString(36).slice(2, 8);

  async function makeUser(extra: Record<string, unknown> = {}) {
    seq += 1;
    return db.user.create({
      data: {
        email: `checkout-portal-${RUN_TAG}-${seq}@sandbox.test`,
        username: `co_portal_${RUN_TAG}_${seq}`,
        ...extra,
      },
    });
  }

  function callGet() {
    return GET(new NextRequest('http://localhost/api/billing/lemonsqueezy/portal'));
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
    ({ GET } = await import('../../../../../app/api/billing/lemonsqueezy/portal/route'));
  });

  it('401 when unauthenticated, no outbound LS call', async () => {
    authMocks.getAuthUserId.mockResolvedValueOnce(null);

    const res = await callGet();

    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns the LS customer-portal URL for a PRO user with a subscription id', async () => {
    const subId = `sub-portal-${RUN_TAG}`;
    const user = await makeUser({
      tier: 'PRO',
      entitlementSource: 'LEMON_SQUEEZY',
      lemonSqueezySubscriptionId: subId,
    });
    authMocks.getAuthUserId.mockResolvedValueOnce(user.id);
    fetchMock.mockResolvedValueOnce(
      lsSubscriptionResponse({
        id: subId,
        variantId: 102,
        portalUrl: `https://ls.test/portal/${subId}-signed`,
      })
    );

    const res = await callGet();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.url).toBe(`https://ls.test/portal/${subId}-signed`);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(`/subscriptions/${subId}`),
      expect.any(Object)
    );
  });

  it('400 for a user with no lemonSqueezySubscriptionId, no outbound LS call', async () => {
    const user = await makeUser();
    authMocks.getAuthUserId.mockResolvedValueOnce(user.id);

    const res = await callGet();

    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('400 for an APPLE_IAP user (App Store subscriptions are managed by Apple, not the LS portal)', async () => {
    const user = await makeUser({
      tier: 'PRO',
      entitlementSource: 'APPLE_IAP',
      lemonSqueezySubscriptionId: `sub-unused-portal-${RUN_TAG}`,
    });
    authMocks.getAuthUserId.mockResolvedValueOnce(user.id);

    const res = await callGet();

    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 5. PUT /api/user/tier — this IS the "cancel" surface. There is no separate
//    app/api/billing/lemonsqueezy/cancel route: SubscriptionPanel's "Cancel
//    subscription" button calls PUT /api/user/tier {tier:'FREE'}, which internally
//    calls cancelLemonSqueezySubscription for LEMON_SQUEEZY-backed users.
// ---------------------------------------------------------------------------
sandboxDescribe('PUT /api/user/tier — cancel surface (no dedicated /billing/.../cancel route exists)', () => {
  let PUT: typeof import('../../../../app/api/user/tier/route').PUT;
  let seq = 0;
  const RUN_TAG = Math.random().toString(36).slice(2, 8);

  async function makeUser(extra: Record<string, unknown> = {}) {
    seq += 1;
    return db.user.create({
      data: {
        email: `checkout-cancel-${RUN_TAG}-${seq}@sandbox.test`,
        username: `co_cancel_${RUN_TAG}_${seq}`,
        ...extra,
      },
    });
  }

  function callPut(body: unknown) {
    return PUT(
      new NextRequest('http://localhost/api/user/tier', {
        method: 'PUT',
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json' },
      })
    );
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) }); // DELETE /subscriptions/:id
    ({ PUT } = await import('../../../../app/api/user/tier/route'));
  });

  it('401 when unauthenticated, no db effect and no outbound LS call', async () => {
    authMocks.getAuthUserId.mockResolvedValueOnce(null);

    const res = await callPut({ tier: 'FREE' });

    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('LEMON_SQUEEZY-backed PRO user: calls DELETE on the correct subscription id, sets pendingTier=FREE, keeps tier PRO until period end', async () => {
    const subId = `sub-cancel-${RUN_TAG}`;
    const user = await makeUser({
      tier: 'PRO',
      entitlementSource: 'LEMON_SQUEEZY',
      lemonSqueezySubscriptionId: subId,
    });
    authMocks.getAuthUserId.mockResolvedValueOnce(user.id);

    const res = await callPut({ tier: 'FREE' });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.pendingTier).toBe('FREE');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(`/subscriptions/${subId}`),
      expect.objectContaining({ method: 'DELETE' })
    );

    const updated = await db.user.findUnique({ where: { id: user.id } });
    expect(updated?.tier).toBe('PRO'); // access continues until ends_at
    expect(updated?.pendingTier).toBe('FREE');
  });

  it('APPLE_IAP user: 400, no outbound LS call, no db write', async () => {
    const user = await makeUser({
      tier: 'PRO',
      entitlementSource: 'APPLE_IAP',
      lemonSqueezySubscriptionId: `sub-unused-cancel-${RUN_TAG}`,
    });
    authMocks.getAuthUserId.mockResolvedValueOnce(user.id);

    const res = await callPut({ tier: 'FREE' });

    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
    const unchanged = await db.user.findUnique({ where: { id: user.id } });
    expect(unchanged?.pendingTier).toBeNull();
  });

  it('attempting to set tier=PRO directly is rejected (paid tiers only activate via payment)', async () => {
    const user = await makeUser();
    authMocks.getAuthUserId.mockResolvedValueOnce(user.id);

    const res = await callPut({ tier: 'PRO' });

    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
