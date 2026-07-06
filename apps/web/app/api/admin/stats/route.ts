import { NextRequest } from 'next/server';
import { getAdminUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { successResponse, forbiddenResponse, internalErrorResponse } from '@/lib/api-response';
import { TIERS } from '@/lib/tiers';
import { computeCacheHitRatio } from '@/lib/ai-usage';

// GET — platform stats overview (admin only)
export async function GET(request: NextRequest) {
  try {
    const adminId = await getAdminUserId(request);
    if (!adminId) return forbiddenResponse('Admin access required');

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [totalUsers, tierCounts, usageAgg, usageByFeatureRaw, waitlistCount] = await Promise.all([
      db.user.count(),
      db.user.groupBy({
        by: ['tier'],
        _count: { _all: true },
      }),
      // All-AI token spend + computed USD cost (every feature, not just chat).
      db.aiUsageEvent.aggregate({
        where: { createdAt: { gte: sevenDaysAgo } },
        _sum: { inputTokens: true, outputTokens: true, cacheReadTokens: true, cacheWriteTokens: true, costUsd: true },
      }),
      // Per-feature breakdown for the same window.
      db.aiUsageEvent.groupBy({
        by: ['feature'],
        where: { createdAt: { gte: sevenDaysAgo } },
        _sum: { inputTokens: true, outputTokens: true, cacheReadTokens: true, cacheWriteTokens: true, costUsd: true },
        _count: { _all: true },
      }),
      db.waitlist.count(),
    ]);

    const tierMap: Record<string, number> = { FREE: 0, PRO: 0 };
    for (const row of tierCounts) {
      tierMap[row.tier] = row._count._all;
    }

    const freeUsers = tierMap.FREE || 0;
    const proUsers = tierMap.PRO || 0;

    const weeklyInputTokens = usageAgg._sum.inputTokens ?? 0;
    const weeklyTokensTotal = weeklyInputTokens + (usageAgg._sum.outputTokens ?? 0);
    const weeklyCacheReadTokens = usageAgg._sum.cacheReadTokens ?? 0;
    const weeklyCacheHitRatio = computeCacheHitRatio(weeklyCacheReadTokens, weeklyInputTokens);
    const weeklyCostUsd = usageAgg._sum.costUsd ?? 0;
    const avgWeeklyTokensPerUser = totalUsers > 0 ? weeklyTokensTotal / totalUsers : 0;

    // Per-feature rollup, heaviest token spend first.
    const usageByFeature = usageByFeatureRaw
      .map((row) => {
        const cacheReadTokens = row._sum.cacheReadTokens ?? 0;
        return {
          feature: row.feature,
          tokens: (row._sum.inputTokens ?? 0) + (row._sum.outputTokens ?? 0),
          costUsd: row._sum.costUsd ?? 0,
          calls: row._count._all,
          cacheReadTokens,
          cacheHitRatio: computeCacheHitRatio(cacheReadTokens, row._sum.inputTokens ?? 0),
        };
      })
      .sort((a, b) => b.tokens - a.tokens);

    // Rough MRR estimate in CHF — Pro headcount × the monthly Pro price.
    const totalRevenue = Math.round(proUsers * TIERS.PRO.priceCHF);

    return successResponse({
      totalUsers,
      freeUsers,
      proUsers,
      avgWeeklyTokensPerUser: Math.round(avgWeeklyTokensPerUser),
      weeklyTokensTotal,
      weeklyCacheReadTokens,
      weeklyCacheHitRatio,
      weeklyCostUsd,
      usageByFeature,
      totalRevenue,
      waitlistCount,
    });
  } catch {
    return internalErrorResponse();
  }
}
