import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { getCachedUserUsageSummary } from '@/lib/usage-limits';
import { getCachedTokenBudget } from '@/lib/token-budget';
import { AI_PATHS_PER_DAY } from '@/lib/tiers';
import { successResponse, unauthorizedResponse, internalErrorResponse } from '@/lib/api-response';

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    // Same UTC-day window the create route enforces (AI_PATHS_PER_DAY).
    const now = new Date();
    const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    const [features, tokenBudget, pathsToday] = await Promise.all([
      getCachedUserUsageSummary(userId),
      getCachedTokenBudget(userId),
      db.studyPlan.count({ where: { userId, source: 'ai', createdAt: { gte: dayStart } } }),
    ]);

    return successResponse({
      features,
      tokenBudget: {
        used: tokenBudget.usedTokens,
        limit: tokenBudget.tokenLimit,
      },
      dailyPaths: {
        used: pathsToday,
        limit: AI_PATHS_PER_DAY,
      },
    });
  } catch (error) {
    console.error('[GET /api/user/usage]', error);
    return internalErrorResponse();
  }
}
