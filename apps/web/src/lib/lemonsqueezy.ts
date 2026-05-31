import type { Tier } from '@prisma/client';
import { db } from '@/lib/db';
import { activeGrant } from '@/lib/entitlement';

/**
 * Server-side Lemon Squeezy (Merchant of Record) helpers — the web/desktop
 * payment channel that replaces Paddle (which declined our application). Mirrors
 * the structure of src/lib/paddle.ts: a thin REST client, a variant→tier lookup,
 * and an idempotent provisioning path shared by the webhook and /sync fallback.
 *
 * REST-only (no SDK dependency): LS exposes a JSON:API at
 * https://api.lemonsqueezy.com/v1; webhook signatures use Node crypto.
 *
 * TODO(ls-config): set LEMONSQUEEZY_API_KEY, LEMONSQUEEZY_PRO_VARIANT_IDS,
 * LEMONSQUEEZY_WEBHOOK_SECRET, and NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL once the
 * store + Pro variants exist.
 */

const LS_API = 'https://api.lemonsqueezy.com/v1';

/** Loose shape of the LS subscription `attributes` object we read. */
export interface LsSubscriptionAttributes {
  customer_id?: number | string;
  variant_id?: number | string;
  status?: string; // on_trial | active | paused | past_due | unpaid | cancelled | expired
  renews_at?: string | null;
  ends_at?: string | null;
  updated_at?: string;
  urls?: { customer_portal?: string | null };
}

function lsHeaders(): HeadersInit {
  const apiKey = process.env.LEMONSQUEEZY_API_KEY;
  if (!apiKey) throw new Error('LEMONSQUEEZY_API_KEY environment variable is missing');
  return {
    Accept: 'application/vnd.api+json',
    'Content-Type': 'application/vnd.api+json',
    Authorization: `Bearer ${apiKey}`,
  };
}

/** Parsed set of Pro variant ids (weekly/monthly/yearly) from LEMONSQUEEZY_PRO_VARIANT_IDS. */
function proVariantIds(): Set<string> {
  return new Set(
    (process.env.LEMONSQUEEZY_PRO_VARIANT_IDS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

/** Reverse lookup: LS variant id → NoteMage tier. Any configured Pro variant → PRO. */
export function tierFromLemonSqueezyVariantId(
  variantId: string | number | null | undefined
): Tier | null {
  if (variantId == null) return null;
  return proVariantIds().has(String(variantId)) ? 'PRO' : null;
}

/**
 * Minimal structural view of a LS subscription, shared by the webhook payload
 * and a fetched subscription so one provisioning path serves both.
 */
export interface LemonSqueezySubscriptionView {
  id: string;
  customerId: string;
  variantId: string;
  status: string;
  renewsAt: string | null;
  endsAt: string | null;
  customPortalUrl: string | null;
  /** From checkout custom_data.user_id (present on webhook deliveries). */
  userId: string | null;
}

const ACTIVE_STATUSES = new Set(['active', 'on_trial']);

export function isActiveLemonSqueezyStatus(status: string): boolean {
  return ACTIVE_STATUSES.has(status);
}

/** Map LS subscription attributes (snake_case) onto the shared view. */
export function mapSubscription(
  id: string,
  attrs: LsSubscriptionAttributes,
  customUserId?: string | null
): LemonSqueezySubscriptionView {
  return {
    id,
    customerId: attrs.customer_id != null ? String(attrs.customer_id) : '',
    variantId: attrs.variant_id != null ? String(attrs.variant_id) : '',
    status: String(attrs.status ?? ''),
    renewsAt: attrs.renews_at ?? null,
    endsAt: attrs.ends_at ?? null,
    customPortalUrl: attrs.urls?.customer_portal ?? null,
    userId: customUserId ?? null,
  };
}

/** Resolve which NoteMage user a LS subscription belongs to. */
export async function resolveLemonSqueezyUserId(opts: {
  userId: string | null;
  customerId: string | null;
}): Promise<string | null> {
  if (opts.userId) {
    const u = await db.user.findUnique({ where: { id: opts.userId }, select: { id: true } });
    if (u) return u.id;
  }
  if (opts.customerId) {
    const u = await db.user.findUnique({
      where: { lemonSqueezyCustomerId: opts.customerId },
      select: { id: true },
    });
    if (u) return u.id;
  }
  return null;
}

/**
 * Promote a user to PRO from a LS subscription. Idempotent — used by the webhook
 * and the post-checkout /sync fallback. A scheduled cancel (status `cancelled`,
 * still active until ends_at) keeps PRO and sets pendingTier=FREE.
 */
export async function provisionFromLemonSqueezySubscription(
  userId: string,
  sub: LemonSqueezySubscriptionView
): Promise<void> {
  const tier = tierFromLemonSqueezyVariantId(sub.variantId);
  if (tier !== 'PRO') return; // unknown variant — ignore rather than mis-provision

  const scheduledCancel = sub.status === 'cancelled';
  const periodEndIso = scheduledCancel ? sub.endsAt : sub.renewsAt;
  const periodEnd = periodEndIso ? new Date(periodEndIso) : null;

  await db.user.update({
    where: { id: userId },
    data: {
      ...activeGrant({ source: 'LEMON_SQUEEZY', periodEnd }),
      lemonSqueezyCustomerId: sub.customerId,
      lemonSqueezySubscriptionId: sub.id,
      ...(scheduledCancel ? { pendingTier: 'FREE' } : {}),
    },
  });
}

/** GET a subscription from the LS API and map it to the shared view. */
export async function getLemonSqueezySubscription(
  subscriptionId: string
): Promise<LemonSqueezySubscriptionView | null> {
  const res = await fetch(`${LS_API}/subscriptions/${subscriptionId}`, { headers: lsHeaders() });
  if (!res.ok) return null;
  const json = (await res.json()) as {
    data?: { id: string; attributes: LsSubscriptionAttributes };
    // LS echoes the checkout custom_data on the subscription object's top-level
    // `meta`, so a fetched subscription carries the same signed owner binding the
    // webhook trusts (meta.custom_data.user_id).
    meta?: { custom_data?: Record<string, unknown> };
  };
  if (!json.data) return null;
  const rawUserId = json.meta?.custom_data?.user_id;
  const customUserId = typeof rawUserId === 'string' && rawUserId ? rawUserId : null;
  return mapSubscription(json.data.id, json.data.attributes, customUserId);
}

/**
 * Decide whether `callerId` is allowed to provision from a fetched subscription.
 *
 * The /sync route takes a client-supplied subscriptionId, so we MUST prove the
 * subscription belongs to the caller before promoting them to PRO and seizing
 * the @unique customer/subscription columns. We trust only bindings the webhook
 * also trusts:
 *   1. The subscription's signed checkout custom_data.user_id (sub.userId), when
 *      LS echoed it on the GET — it must equal the caller.
 *   2. Otherwise, the subscription's customer must already be bound to the caller
 *      (sub.customerId === caller's existing User.lemonSqueezyCustomerId), which
 *      can only have been set by a prior trusted (webhook/owned-sync) provision.
 * Any client-supplied id whose owner cannot be matched to the caller is rejected.
 */
async function syncOwnerMatchesCaller(
  callerId: string,
  sub: LemonSqueezySubscriptionView
): Promise<boolean> {
  if (sub.userId) {
    // custom_data.user_id is the authoritative owner — require an exact match.
    return sub.userId === callerId;
  }
  // No signed owner on the GET: fall back to an already-established customer bind.
  if (!sub.customerId) return false;
  const owner = await db.user.findUnique({
    where: { lemonSqueezyCustomerId: sub.customerId },
    select: { id: true },
  });
  return owner?.id === callerId;
}

/**
 * Post-checkout fallback for POST /api/billing/lemonsqueezy/sync when the webhook
 * is slow. Fetches the subscription, verifies it belongs to the caller, then
 * provisions (idempotent). Returns null without provisioning if the resolved
 * owner does not match `opts.userId` — a caller may only sync their OWN
 * subscription (the webhook keeps its own signed-custom_data binding).
 */
export async function syncLemonSqueezyAfterCheckout(opts: {
  userId: string;
  subscriptionId: string;
}): Promise<Tier | null> {
  const sub = await getLemonSqueezySubscription(opts.subscriptionId);
  if (!sub) return null;
  if (!(await syncOwnerMatchesCaller(opts.userId, sub))) return null; // not the caller's subscription
  await provisionFromLemonSqueezySubscription(opts.userId, sub);
  const user = await db.user.findUnique({ where: { id: opts.userId }, select: { tier: true } });
  return user?.tier ?? null;
}

/** Cancel a LS subscription at period end (DELETE = cancel; access until ends_at). */
export async function cancelLemonSqueezySubscription(subscriptionId: string): Promise<void> {
  const res = await fetch(`${LS_API}/subscriptions/${subscriptionId}`, {
    method: 'DELETE',
    headers: lsHeaders(),
  });
  if (!res.ok) throw new Error(`Lemon Squeezy cancel failed: ${res.status}`);
}

/** The signed customer-portal URL for managing / cancelling (read off the subscription). */
export async function getLemonSqueezyPortalUrl(subscriptionId: string): Promise<string | null> {
  const sub = await getLemonSqueezySubscription(subscriptionId);
  return sub?.customPortalUrl ?? null;
}
