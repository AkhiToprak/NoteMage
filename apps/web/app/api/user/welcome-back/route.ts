import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { successResponse, unauthorizedResponse, internalErrorResponse } from '@/lib/api-response';

/** A user is "returning" once they've been away longer than this. */
const ABSENCE_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * POST /api/user/welcome-back
 *
 * One-shot trigger check for the welcome-back takeover. Performs an *atomic*
 * conditional update: it bumps `lastSeenAt` to now only when the stored value is
 * older than the absence threshold, and reports whether that matched. Because it
 * reads the persisted `lastSeenAt`, it correctly fires for users who were
 * already away before this feature shipped — and because the claim is a single
 * conditional UPDATE, the takeover can fire at most once per absence (subsequent
 * calls / other tabs see a fresh timestamp and get `wasAway: false`).
 *
 * Note: the study-heartbeat also bumps `lastSeenAt` on mount; this gate runs in
 * a child effect (before the heartbeat's effect) so it normally claims first. In
 * the rare case the heartbeat wins the row, the takeover simply skips that visit
 * — it never double-fires and never blocks the app.
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const now = new Date();
    const cutoff = new Date(now.getTime() - ABSENCE_MS);

    const claim = await db.user.updateMany({
      where: { id: userId, lastSeenAt: { lt: cutoff } },
      data: { lastSeenAt: now },
    });

    return successResponse({ wasAway: claim.count > 0 });
  } catch {
    return internalErrorResponse();
  }
}
