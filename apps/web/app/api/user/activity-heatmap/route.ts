import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  successResponse,
  unauthorizedResponse,
  forbiddenResponse,
  internalErrorResponse,
} from '@/lib/api-response';

/**
 * GET /api/user/activity-heatmap?days=365&userId=...
 *
 * Returns the daily count of distinct minutes the target user had the app
 * open. The heatmap component renders one cell per day; `count` here is a
 * minute count, not an action count.
 *
 * `userId` is optional — when set (and different from the authed user) we
 * read the target user's data so the friend-profile page can render its
 * activity board. A session is always required, and cross-user reads are
 * gated server-side behind the target's `profilePrivate` flag + an accepted
 * friendship (mirroring profile/peers) so the endpoint can't be used as an
 * unauthenticated activity oracle.
 */
export async function GET(request: NextRequest) {
  try {
    const authUserId = await getAuthUserId(request);
    if (!authUserId) return unauthorizedResponse();

    const url = new URL(request.url);
    const targetUserId = url.searchParams.get('userId');

    // Cross-user view: gate behind the target's privacy + an accepted
    // friendship, mirroring /api/user/profile/[username] and /api/schools/peers.
    if (targetUserId && targetUserId !== authUserId) {
      const target = await db.user.findUnique({
        where: { id: targetUserId },
        select: { profilePrivate: true },
      });
      if (!target) return forbiddenResponse('Not allowed to view this activity');

      if (target.profilePrivate) {
        const friendship = await db.friendship.findFirst({
          where: {
            status: 'accepted',
            OR: [
              { requesterId: authUserId, addresseeId: targetUserId },
              { requesterId: targetUserId, addresseeId: authUserId },
            ],
          },
          select: { id: true },
        });
        if (!friendship) return forbiddenResponse('Not allowed to view this activity');
      }
    }

    const userId =
      targetUserId && targetUserId !== authUserId ? targetUserId : authUserId;

    const days = Math.min(Number(url.searchParams.get('days')) || 365, 365);

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    // Aggregate minutes-per-day in SQL — `study_minutes.minute` stores a
    // minute-truncated timestamp, so DATE() collapses to one row per day.
    const rows = await db.$queryRaw<{ date: Date; count: bigint }[]>(Prisma.sql`
      SELECT DATE("minute") AS date, COUNT(*)::bigint AS count
      FROM study_minutes
      WHERE "userId" = ${userId} AND "minute" >= ${startDate}
      GROUP BY DATE("minute")
      ORDER BY date ASC
    `);

    const data = rows.map((row) => ({
      date: row.date.toISOString().split('T')[0],
      count: Number(row.count),
    }));

    return successResponse({ data });
  } catch {
    return internalErrorResponse();
  }
}
