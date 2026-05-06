import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { getUserUsageSummary } from '@/lib/usage-limits';
import { checkTokenBudget } from '@/lib/token-budget';
import { successResponse, unauthorizedResponse, internalErrorResponse } from '@/lib/api-response';

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const [features, tokenBudget] = await Promise.all([
      getUserUsageSummary(userId),
      checkTokenBudget(userId),
    ]);

    return successResponse({
      features,
      tokenBudget: {
        used: tokenBudget.usedTokens,
        limit: tokenBudget.tokenLimit,
      },
    });
  } catch (error) {
    console.error('[GET /api/user/usage]', error);
    return internalErrorResponse();
  }
}
