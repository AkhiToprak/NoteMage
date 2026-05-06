import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { successResponse, unauthorizedResponse, internalErrorResponse } from '@/lib/api-response';

/**
 * GET /api/user/activity-heatmap?days=365&userId=...
 *
 * Returns the daily count of distinct minutes the target user had the app
 * open. The heatmap component renders one cell per day; `count` here is a
 * minute count, not an action count.
 *
 * `userId` is optional — when set (and different from the authed user) we
 * read the target user's data so the friend-profile page can render its
 * activity board. The profile page already gates visibility behind
 * `!isPrivate`, mirroring how achievements and cosmetics are gated.
 */
export async function GET(request: NextRequest) {
  try {
    const authUserId = await getAuthUserId(request);

    const url = new URL(request.url);
    const targetUserId = url.searchParams.get('userId');

    const userId = targetUserId && targetUserId !== authUserId ? targetUserId : authUserId;
    if (!userId) return unauthorizedResponse();

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
