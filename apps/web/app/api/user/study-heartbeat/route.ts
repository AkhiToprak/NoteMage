import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { successResponse, unauthorizedResponse, internalErrorResponse } from '@/lib/api-response';
import { updateStreak } from '@/lib/streaks';

/**
 * POST /api/user/study-heartbeat
 *
 * Records that the authed user had the app open during the current minute.
 * The client fires this from a visibility-gated interval (see
 * `useStudyHeartbeat`). Inserts are deduped on the StudyMinute primary key
 * `(userId, minute)` so multi-tab pings within the same minute are no-ops.
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    // Truncate to the current minute (UTC).
    const minute = new Date();
    minute.setUTCSeconds(0, 0);

    // Idempotent insert. Prisma's `createMany` with `skipDuplicates` lets the
    // unique pkey absorb concurrent writes from multiple tabs.
    await db.studyMinute.createMany({
      data: [{ userId, minute }],
      skipDuplicates: true,
    });

    // Bump lastSeenAt so the friend list's presence info stays fresh even
    // when the user never opens a WS connection (ws-server only ticks for
    // users currently connected via socket.io, which is rare outside cowork).
    // Throttled to once every 2 min via the OR-on-stale filter to keep
    // writes bounded.
    const twoMinAgo = new Date(Date.now() - 120_000);
    db.user
      .updateMany({
        where: {
          id: userId,
          OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: twoMinAgo } }],
        },
        data: { lastSeenAt: new Date() },
      })
      .catch(() => {});

    // Keep streak progression on app usage now that recordActivity is gone.
    updateStreak(userId).catch(() => {});

    return successResponse({ minute: minute.toISOString() });
  } catch {
    return internalErrorResponse();
  }
}
