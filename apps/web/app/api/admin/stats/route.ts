import { NextRequest } from 'next/server';
import { getAdminUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { successResponse, forbiddenResponse, internalErrorResponse } from '@/lib/api-response';

// GET — platform stats overview (admin only)
export async function GET(request: NextRequest) {
  try {
    const adminId = await getAdminUserId(request);
    if (!adminId) return forbiddenResponse('Admin access required');

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [totalUsers, tierCounts, weeklyTokensAgg, waitlistCount] = await Promise.all([
      db.user.count(),
      db.user.groupBy({
        by: ['tier'],
        _count: { _all: true },
      }),
      db.chatMessage.aggregate({
        where: { createdAt: { gte: sevenDaysAgo }, tokens: { not: null } },
        _sum: { tokens: true },
      }),
      db.waitlist.count(),
    ]);

    const tierMap: Record<string, number> = { FREE: 0, PLUS: 0, PRO: 0 };
    for (const row of tierCounts) {
      tierMap[row.tier] = row._count._all;
    }

    const freeUsers = tierMap.FREE || 0;
    const plusUsers = tierMap.PLUS || 0;
    const proUsers = tierMap.PRO || 0;

    const weeklyTokensTotal = weeklyTokensAgg._sum.tokens ?? 0;
    const avgWeeklyTokensPerUser = totalUsers > 0 ? weeklyTokensTotal / totalUsers : 0;

    const totalRevenue = plusUsers * 5 + proUsers * 10;

    return successResponse({
      totalUsers,
      freeUsers,
      plusUsers,
      proUsers,
      avgWeeklyTokensPerUser: Math.round(avgWeeklyTokensPerUser),
      weeklyTokensTotal,
      totalRevenue,
      waitlistCount,
    });
  } catch {
    return internalErrorResponse();
  }
}
