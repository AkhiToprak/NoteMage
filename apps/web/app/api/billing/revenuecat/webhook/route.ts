import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { activeGrant, endSubscription } from '@/lib/entitlement';

export const runtime = 'nodejs';

const PROVIDER = 'revenuecat';
/** The RevenueCat Entitlement id mapped to NoteMage PRO (configure it as `pro` in RC). */
const RC_ENTITLEMENT = 'pro';
/** Event types that mean "PRO is active right now". */
const ACTIVE_TYPES = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'UNCANCELLATION',
  'PRODUCT_CHANGE',
  'NON_RENEWING_PURCHASE',
]);

interface RcEvent {
  type?: string;
  id?: string;
  app_user_id?: string;
  entitlement_ids?: string[];
  expiration_at_ms?: number | null;
  original_transaction_id?: string | null;
  product_id?: string | null;
}

/**
 * Quota cadence from the StoreKit product id. Convention: the weekly product's
 * id contains "weekly" (nm_pro_weekly); everything else — monthly, yearly, or
 * an unrecognized id — gets monthly semantics, mirroring the Lemon Squeezy
 * mapping (yearly is quota-identical to monthly, see tiers.ts). Must be passed
 * on every grant: trial signups start with billingInterval='weekly', so leaving
 * the column untouched would keep a paying monthly subscriber on weekly caps.
 */
function intervalFromProductId(productId: string | null | undefined): 'weekly' | 'monthly' {
  return productId?.toLowerCase().includes('weekly') ? 'weekly' : 'monthly';
}

function authOk(header: string | null, expected: string): boolean {
  if (!header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * POST /api/billing/revenuecat/webhook
 *
 * Authoritative fulfillment for the iOS channel. RevenueCat posts server-to-
 * server with a static Authorization header (set in the RC dashboard) verified
 * against REVENUECAT_WEBHOOK_AUTH. `app_user_id` equals User.id because the
 * shell calls Purchases.logIn(User.id) (see the setAppUser bridge verb), so the
 * purchase binds to the account. Converges on the same User.tier fields as the
 * Lemon Squeezy webhook via the shared entitlement helpers.
 */
export async function POST(request: NextRequest) {
  const expected = process.env.REVENUECAT_WEBHOOK_AUTH;
  if (!expected) {
    console.error('[RevenueCat Webhook] REVENUECAT_WEBHOOK_AUTH is not set');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
  }
  if (!authOk(request.headers.get('authorization'), expected)) {
    console.error('[RevenueCat Webhook] Authorization check failed');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let event: RcEvent | undefined;
  try {
    event = ((await request.json()) as { event?: RcEvent }).event;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!event?.type || !event.id || !event.app_user_id) {
    return NextResponse.json({ received: true, ignored: true });
  }

  // Idempotency: claim the event id first; a duplicate delivery is a no-op.
  try {
    await db.webhookEvent.create({
      data: { provider: PROVIDER, eventId: event.id, eventType: event.type },
    });
  } catch {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    await handleEvent(event);
  } catch (error) {
    console.error(`[RevenueCat Webhook] Error handling ${event.type}:`, error);
    await db.webhookEvent
      .delete({ where: { provider_eventId: { provider: PROVIDER, eventId: event.id } } })
      .catch(() => {});
    return NextResponse.json({ error: 'Webhook handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

async function handleEvent(event: RcEvent) {
  // Only our Pro entitlement matters; ignore events for anything else.
  if (!(event.entitlement_ids ?? []).includes(RC_ENTITLEMENT)) return;

  const userId = await resolveUserId(event.app_user_id!);
  if (!userId) {
    console.error('[RevenueCat Webhook] Unresolved user for app_user_id', event.app_user_id);
    return; // never provision an orphan PRO
  }

  const type = event.type!;

  if (ACTIVE_TYPES.has(type)) {
    // Only grant when the entitlement is actually active right now: require a
    // future expiry. A null/past expiration_at_ms means the entitlement is not
    // currently active (e.g. a stale/replayed purchase event), so we must not
    // grant PRO — and never set an unbounded (periodEnd=null) PRO.
    const periodEnd = event.expiration_at_ms ? new Date(event.expiration_at_ms) : null;
    if (!periodEnd || periodEnd.getTime() <= Date.now()) {
      return; // expired / non-active grant → do not provision
    }
    // Renewal (already paid) vs first purchase / trial conversion — gates the
    // one-shot success screen so it never replays on a RENEWAL event.
    const prev = await db.user.findUnique({
      where: { id: userId },
      select: { tier: true, entitlementSource: true },
    });
    const wasActive = prev?.tier === 'PRO' && prev.entitlementSource !== null;
    await db.user.update({
      where: { id: userId },
      data: {
        ...activeGrant({
          source: 'APPLE_IAP',
          periodEnd,
          interval: intervalFromProductId(event.product_id),
          wasActive,
        }),
        revenueCatAppUserId: event.app_user_id,
        ...(event.original_transaction_id
          ? { appleOriginalTransactionId: event.original_transaction_id }
          : {}),
      },
    });
    return;
  }

  if (type === 'CANCELLATION' || type === 'SUBSCRIPTION_PAUSED') {
    // Auto-renew turned off / paused — keep PRO until expiry, flag the downgrade.
    await db.user.update({ where: { id: userId }, data: { pendingTier: 'FREE' } });
    return;
  }

  if (type === 'BILLING_ISSUE') {
    await db.user.update({ where: { id: userId }, data: { inGracePeriod: true } });
    return;
  }

  if (type === 'EXPIRATION') {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { entitlementSource: true },
    });
    if (user) {
      await db.user.update({ where: { id: userId }, data: endSubscription(user, 'APPLE_IAP') });
    }
    return;
  }

  // TRANSFER and anything else: acknowledge; a following RENEWAL/EXPIRATION reconciles.
}

/** app_user_id is set to User.id via Purchases.logIn; fall back to the stored id. */
async function resolveUserId(appUserId: string): Promise<string | null> {
  const byId = await db.user.findUnique({ where: { id: appUserId }, select: { id: true } });
  if (byId) return byId.id;
  const byRc = await db.user.findFirst({
    where: { revenueCatAppUserId: appUserId },
    select: { id: true },
  });
  return byRc?.id ?? null;
}
