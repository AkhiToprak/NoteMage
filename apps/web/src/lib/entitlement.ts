import { Prisma, type EntitlementSource, type User } from '@prisma/client';
import type { Entitlement } from '@notemage/shared';

/**
 * Entitlement resolution — the single place the canonical entitlement shape and
 * the cross-channel downgrade-safety rule live.
 *
 * The keystone of the payments design: `User.tier` stays the ONLY feature gate
 * (see src/lib/usage-limits.ts). The other billing columns just record WHICH
 * provider backs that tier, until when, and whether we're in a dunning window.
 * Both the Lemon Squeezy and RevenueCat webhooks converge here so the payment
 * channels stay decoupled from the account.
 */

/** The providers that can grant a tier (MANUAL is admin-only / inert; PADDLE retired). */
export type BillingProvider = Extract<EntitlementSource, 'APPLE_IAP' | 'LEMON_SQUEEZY'>;

type BillingFields = Pick<
  User,
  'tier' | 'entitlementSource' | 'subscriptionPeriodEnd' | 'inGracePeriod'
>;

/**
 * Map a user row onto the shared `Entitlement` contract
 * (packages/shared/src/bridge.ts) verbatim. This is exactly what
 * /api/me/entitlement returns and what every shell reads as the source of
 * truth; `source`/`expiresAt`/`inGracePeriod` are advisory metadata for billing
 * UI, never a gate.
 */
export function resolveActiveEntitlement(user: BillingFields): Entitlement {
  return {
    tier: user.tier,
    source: user.entitlementSource ?? null,
    expiresAt: user.subscriptionPeriodEnd ? user.subscriptionPeriodEnd.toISOString() : null,
    inGracePeriod: user.inGracePeriod,
  };
}

/**
 * The User update for an *active* subscription from `provider` (purchase,
 * renewal, plan change, uncancellation). Promotes to PRO and records the source.
 * Callers spread this and add the provider-specific id columns.
 */
export function activeGrant(opts: {
  source: BillingProvider;
  periodEnd: Date | null;
}): Prisma.UserUpdateInput {
  return {
    tier: 'PRO',
    entitlementSource: opts.source,
    subscriptionPeriodEnd: opts.periodEnd,
    inGracePeriod: false,
    pendingTier: null,
  };
}

/**
 * The User update for a subscription that has *ended* (Lemon Squeezy expired /
 * cancelled past ends_at / RevenueCat `EXPIRATION`).
 *
 * Cross-channel safety rule: only actually drop `tier` to FREE when `provider`
 * is the one currently backing it (`entitlementSource === provider`). A stale or
 * duplicate end-event from a provider that is NOT the active source must never
 * revoke a still-active subscription from the other channel — it only detaches
 * its own dead subscription id. (Concurrent dual subscriptions are prevented
 * up-front by hiding the other channel's upgrade CTA, so in practice the active
 * source is unambiguous.)
 *
 * Apple ids are intentionally retained on downgrade (RevenueCat keeps the
 * appUserId, and originalTransactionId is needed for restore/transfer); only
 * Lemon Squeezy's per-subscription id is cleared (the customer record persists
 * for re-subscribe / portal access).
 */
export function endSubscription(
  user: Pick<User, 'entitlementSource'>,
  provider: BillingProvider
): Prisma.UserUpdateInput {
  const detach: Prisma.UserUpdateInput =
    provider === 'LEMON_SQUEEZY' ? { lemonSqueezySubscriptionId: null } : {};

  if (user.entitlementSource !== provider) {
    // Not the backing provider — leave tier/period alone, just detach its id.
    return detach;
  }

  return {
    ...detach,
    tier: 'FREE',
    entitlementSource: null,
    pendingTier: null,
    subscriptionPeriodEnd: null,
    inGracePeriod: false,
  };
}
