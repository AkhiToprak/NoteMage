import { db } from '@/lib/db';
import { getServerAuthToken } from '@/lib/server-auth';
import { WelcomeBackClient } from './WelcomeBackClient';

/** A user is "returning" once they've been away longer than this. */
const ABSENCE_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * Server-rendered trigger for the welcome-back takeover. Runs during SSR of the
 * dashboard, so when the user is returning the overlay's dark scrim is already
 * in the initial HTML — no flash of the dashboard, it appears immediately.
 *
 * It performs the same atomic claim as before (bump `lastSeenAt` only when it's
 * older than the threshold). Because this runs server-side before any client
 * code, it always wins the race against the study-heartbeat, works for users
 * absent before the feature shipped, and fires at most once per absence.
 * Fails open (renders nothing) on any error.
 */
export async function WelcomeBackServerGate() {
  try {
    const token = await getServerAuthToken();

    const userId = token?.id;
    if (!userId) return null;
    if (token?.onboardingComplete === false) return null;

    const now = new Date();
    const cutoff = new Date(now.getTime() - ABSENCE_MS);
    const claim = await db.user.updateMany({
      where: { id: userId, lastSeenAt: { lt: cutoff } },
      data: { lastSeenAt: now },
    });
    if (claim.count === 0) return null;
  } catch {
    return null;
  }

  return <WelcomeBackClient />;
}

export default WelcomeBackServerGate;
