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

    // Keep streak progression on app usage now that recordActivity is gone.
    updateStreak(userId).catch(() => {});

    return successResponse({ minute: minute.toISOString() });
  } catch {
    return internalErrorResponse();
  }
}
