import { Prisma, type BillingInterval, type EntitlementSource, type User } from '@prisma/client';
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

/** Free-trial length for new signups. */
const TRIAL_DAYS = 7;

/**
 * The User fields that put a brand-new account into its 7-day free trial: PRO
 * access on weekly caps (tiers.ts PRO_WEEKLY_*), no payment provider. Spread into
 * the `user.create` data at both signup sites (OAuth + credentials). Because
 * `entitlementSource` stays null, once `trialEndsAt` passes the dashboard
 * AccountGate flips tier→FREE and shows the trial-ended gate (subscribe or pause).
 */
export function trialGrant(): Pick<
  Prisma.UserCreateInput,
  'tier' | 'billingInterval' | 'trialEndsAt'
> {
  return {
    tier: 'PRO',
    billingInterval: 'weekly',
    trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000),
  };
}

/** Which gate (if any) the dashboard AccountGate shows. Derived, never stored. */
export type AccountState = 'active' | 'trialing' | 'expired' | 'paused' | 'comped';

type AccountStateFields = Pick<User, 'tier' | 'entitlementSource' | 'trialEndsAt' | 'pausedAt'>;

/**
 * Resolve the account's gate state from its billing columns. Order is load-bearing:
 * a pause wins over everything; comped/active/trialing grant access; anything else
 * (lapsed subscriber, or a trial whose `trialEndsAt` has passed) is `expired` and
 * must subscribe or pause. `inGracePeriod` (dunning) keeps tier=PRO + a paid source,
 * so it resolves to `active` and is intentionally NOT gated.
 */
export function deriveAccountState(user: AccountStateFields, now: Date = new Date()): AccountState {
  if (user.pausedAt) return 'paused';
  if (user.tier === 'PRO') {
    if (user.entitlementSource === 'MANUAL') return 'comped';
    if (user.entitlementSource !== null) return 'active'; // LS / Apple / legacy Paddle
    if (user.trialEndsAt && user.trialEndsAt > now) return 'trialing';
  }
  return 'expired';
}

/**
 * The User update for an *active* subscription from `provider` (purchase,
 * renewal, plan change, uncancellation). Promotes to PRO and records the source.
 * Callers spread this and add the provider-specific id columns.
 */
export function activeGrant(opts: {
  source: BillingProvider;
  periodEnd: Date | null;
  /** Quota cadence for this subscription. Omitted (RevenueCat/iOS) → column left
   *  as-is → monthly semantics. Only the LS weekly variant passes 'weekly'. */
  interval?: BillingInterval;
  /**
   * Whether the user was ALREADY on a paid tier before this grant. `activeGrant`
   * runs on every renewal too (LS `subscription_updated`, RC `RENEWAL`), so the
   * one-shot success screen (`pendingWelcome`) must fire ONLY on the transition
   * into paid — first purchase, trial conversion, or resubscribe-from-lapsed —
   * never on a renewal, or the "You're in!" screen replays every billing cycle.
   * Callers compute this from the pre-update row: `tier === 'PRO' && source != null`.
   */
  wasActive?: boolean;
}): Prisma.UserUpdateInput {
  return {
    tier: 'PRO',
    entitlementSource: opts.source,
    subscriptionPeriodEnd: opts.periodEnd,
    inGracePeriod: false,
    pendingTier: null,
    // Becoming paid ends the trial and lifts any pause (resubscribe), clearing the
    // 3-month retention clock so a returning subscriber is never swept for deletion.
    trialEndsAt: null,
    pausedAt: null,
    ...(opts.interval ? { billingInterval: opts.interval } : {}),
    ...(opts.wasActive ? {} : { pendingWelcome: true }),
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
    billingInterval: null,
  };
}
