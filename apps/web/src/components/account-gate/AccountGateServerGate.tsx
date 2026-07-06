import { db } from '@/lib/db';
import { getServerAuthToken } from '@/lib/server-auth';
import { deriveAccountState } from '@/lib/entitlement';
import { PAUSED_RETENTION_DAYS } from '@/lib/account-deletion';
import { AccountGateOverlay } from './AccountGateOverlay';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Server-rendered account-state gate for the dashboard. Runs during SSR (like
 * WelcomeBackServerGate) so the takeover is already in the initial HTML — no flash
 * of the dashboard behind it.
 *
 *   • pendingWelcome → the "You're in!" success screen, shown once (atomic claim).
 *   • paused         → the locked paused screen (escapable only by subscribing).
 *   • expired        → trial lapsed: flip PRO→FREE so the tier-gated feature APIs
 *                      (which read tier fresh per call) deny, then the trial-ended gate.
 *
 * Writes use guarded atomic `updateMany` so a React double-render or a concurrent
 * tab applies each transition at most once. Fails open (renders nothing) on any
 * error — the gate must never hard-block the dashboard on a DB blip.
 */
export async function AccountGateServerGate() {
  try {
    const token = await getServerAuthToken();
    const userId = token?.id;
    if (!userId) return null;
    // Mid-onboarding users are already funnelled by middleware — don't gate them.
    if (token?.onboardingComplete === false) return null;

    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        tier: true,
        entitlementSource: true,
        trialEndsAt: true,
        pausedAt: true,
        pendingWelcome: true,
        subscriptionPeriodEnd: true,
        billingInterval: true,
      },
    });
    if (!user) return null;

    // 1) Success screen wins — show once, then clear (atomic claim).
    if (user.pendingWelcome) {
      const claim = await db.user.updateMany({
        where: { id: userId, pendingWelcome: true },
        data: { pendingWelcome: false },
      });
      if (claim.count === 1) {
        return (
          <AccountGateOverlay
            variant="welcome"
            interval={user.billingInterval}
            periodEnd={user.subscriptionPeriodEnd ? user.subscriptionPeriodEnd.toISOString() : null}
          />
        );
      }
      // Lost the race (another tab claimed it) — fall through to the state check.
    }

    const state = deriveAccountState(user);

    if (state === 'paused') {
      const deletionAt = user.pausedAt
        ? new Date(user.pausedAt.getTime() + PAUSED_RETENTION_DAYS * DAY_MS).toISOString()
        : null;
      return <AccountGateOverlay variant="paused" deletionAt={deletionAt} />;
    }

    if (state === 'expired') {
      // Trial lapsed while tier still shows PRO → drop to FREE so the tier-gated
      // feature APIs (which read tier fresh from the DB every call) start denying.
      // Guarded + atomic: only an unpaid, un-paused PRO row flips, at most once.
      if (user.tier === 'PRO') {
        await db.user.updateMany({
          where: { id: userId, tier: 'PRO', entitlementSource: null, pausedAt: null },
          data: { tier: 'FREE', billingInterval: null },
        });
      }
      return <AccountGateOverlay variant="expired" />;
    }
  } catch {
    return null;
  }
  return null;
}

export default AccountGateServerGate;
