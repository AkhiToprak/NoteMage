import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import {
  provisionFromLemonSqueezySubscription,
  resolveLemonSqueezyUserId,
  mapSubscription,
  isActiveLemonSqueezyStatus,
  type LemonSqueezySubscriptionView,
  type LsSubscriptionAttributes,
} from '@/lib/lemonsqueezy';
import { endSubscription } from '@/lib/entitlement';

export const runtime = 'nodejs';

const PROVIDER = 'lemonsqueezy';
const GRACE_STATUSES = new Set(['past_due', 'unpaid']);

// Only these carry a Subscription object in `data`. This deliberately EXCLUDES
// the subscription_payment_* events (whose data is an invoice) and order_*
// events, so a renewal payment can never be mis-read as a state change and
// wrongly downgrade the user. Safe even if more events are enabled in the
// Lemon Squeezy dashboard — anything not listed here is acknowledged and ignored.
const SUBSCRIPTION_EVENTS = new Set([
  'subscription_created',
  'subscription_updated',
  'subscription_cancelled',
  'subscription_resumed',
  'subscription_expired',
  'subscription_paused',
  'subscription_unpaused',
  'subscription_plan_changed',
]);

interface LsWebhookPayload {
  meta?: { event_name?: string; custom_data?: Record<string, unknown> };
  data?: { id?: string; attributes?: LsSubscriptionAttributes };
}

/**
 * POST /api/billing/lemonsqueezy/webhook
 *
 * Authoritative fulfillment for the web/desktop channel (Merchant of Record).
 * Verifies the X-Signature HMAC, dedups on a derived event id, then maps
 * subscription state onto the user's tier/billing fields via the shared
 * entitlement helpers. Structural sibling of app/api/billing/paddle/webhook.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[LemonSqueezy Webhook] LEMONSQUEEZY_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
  }

  const signature = request.headers.get('x-signature') ?? '';
  const rawBody = await request.text(); // raw body required for signature verification

  // Verify HMAC-SHA256(rawBody, secret) === X-Signature (hex), constant-time.
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const sigBuf = Buffer.from(signature, 'hex');
  const expBuf = Buffer.from(expected, 'hex');
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    console.error('[LemonSqueezy Webhook] Signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  let payload: LsWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as LsWebhookPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const eventName = payload.meta?.event_name ?? '';
  const subId = payload.data?.id;
  const attrs = payload.data?.attributes;
  if (!eventName || !subId || !attrs) {
    return NextResponse.json({ received: true, ignored: true });
  }

  // Idempotency: LS doesn't send a stable event id, so derive one from the event
  // name + subscription id + status + updated_at. Including status keeps distinct
  // state transitions from colliding when a same-second update shares updated_at
  // with a terminal transition (e.g. cancelled/expired) — otherwise the terminal
  // event would be masked as a duplicate. Claim it first; a duplicate is a no-op.
  const eventId = `${eventName}:${subId}:${String(attrs.status ?? '')}:${String(attrs.updated_at ?? '')}`;
  try {
    await db.webhookEvent.create({
      data: { provider: PROVIDER, eventId, eventType: eventName },
    });
  } catch {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    if (SUBSCRIPTION_EVENTS.has(eventName)) {
      const rawUserId = payload.meta?.custom_data?.user_id;
      const customUserId = typeof rawUserId === 'string' && rawUserId ? rawUserId : null;
      const sub = mapSubscription(subId, attrs, customUserId);
      await applySubscriptionState(sub);
    }
    // subscription_payment_* / order_* events carry nothing to fulfill here.
  } catch (error) {
    console.error(`[LemonSqueezy Webhook] Error handling ${eventName}:`, error);
    // Release the idempotency claim so a retry can re-process.
    await db.webhookEvent
      .delete({ where: { provider_eventId: { provider: PROVIDER, eventId } } })
      .catch(() => {});
    return NextResponse.json({ error: 'Webhook handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

/**
 * State-driven handler for every subscription.* event — the subscription status
 * decides the outcome (mirrors the Paddle handler).
 */
async function applySubscriptionState(sub: LemonSqueezySubscriptionView) {
  const userId = await resolveUserId(sub);
  if (!userId) {
    console.error('[LemonSqueezy Webhook] Could not resolve user for subscription', sub.id);
    return; // never provision an orphan PRO
  }

  // active / on_trial → PRO; `cancelled` keeps PRO until ends_at (provision sets pendingTier).
  if (isActiveLemonSqueezyStatus(sub.status) || sub.status === 'cancelled') {
    await provisionFromLemonSqueezySubscription(userId, sub);
    return;
  }

  if (GRACE_STATUSES.has(sub.status)) {
    // Keep PRO during dunning; just flag the grace window.
    await db.user.update({ where: { id: userId }, data: { inGracePeriod: true } });
    return;
  }

  // expired / paused / anything terminal → end the subscription, but only drop
  // tier if LS is the active source (cross-channel safety lives in entitlement.ts).
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { entitlementSource: true },
  });
  if (user) {
    await db.user.update({
      where: { id: userId },
      data: endSubscription(user, 'LEMON_SQUEEZY'),
    });
  }
}

/** custom_data.user_id → lemonSqueezyCustomerId → lemonSqueezySubscriptionId. */
async function resolveUserId(sub: LemonSqueezySubscriptionView): Promise<string | null> {
  const resolved = await resolveLemonSqueezyUserId({
    userId: sub.userId,
    customerId: sub.customerId,
  });
  if (resolved) return resolved;
  const bySub = await db.user.findFirst({
    where: { lemonSqueezySubscriptionId: sub.id },
    select: { id: true },
  });
  return bySub?.id ?? null;
}
