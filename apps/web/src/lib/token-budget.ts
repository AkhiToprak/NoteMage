import { db } from '@/lib/db';
import { cacheDel, cacheGetOrSet } from '@/lib/redis-cache';
import { TIERS, getMonthStart } from '@/lib/tiers';
import type { TierKey } from '@/lib/tiers';

const TOKEN_BUDGET_CACHE_TTL_SECONDS = 20;

function tokenBudgetCacheKey(userId: string): string {
  return `cache:token-budget:${userId}`;
}

export async function invalidateTokenBudgetCache(userId: string | null): Promise<void> {
  if (!userId) return;
  await cacheDel(tokenBudgetCacheKey(userId));
}

/**
 * Check whether a user has exceeded their monthly token budget.
 * The limit is tier-aware: each tier has its own tokenLimit defined in TIERS.
 * Admins bypass the token budget entirely.
 *
 * Usage now reflects EVERY AI surface — chat, path generation, imports,
 * page-generate, moderation, classify — by aggregating the AiUsageEvent table
 * (input + output tokens), not just ChatMessage.tokens. This closes the budget
 * blind spot where non-chat AI spend never counted toward the monthly ceiling.
 */
export async function checkTokenBudget(userId: string): Promise<{
  allowed: boolean;
  usedTokens: number;
  tokenLimit: number; // -1 = unlimited (admin)
  tier: TierKey;
}> {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { tier: true, role: true },
  });

  // Admins bypass token limits and route as Pro (best chat model).
  if (user.role === 'admin') {
    return { allowed: true, usedTokens: 0, tokenLimit: -1, tier: 'PRO' };
  }

  const tierConfig = TIERS[user.tier as TierKey];
  const tokenLimit = tierConfig.tokenLimit;

  const startOfMonth = getMonthStart();

  const tokenUsage = await db.aiUsageEvent.aggregate({
    where: { userId, createdAt: { gte: startOfMonth } },
    _sum: { inputTokens: true, outputTokens: true },
  });

  const usedTokens =
    (tokenUsage._sum.inputTokens ?? 0) + (tokenUsage._sum.outputTokens ?? 0);
  return { allowed: usedTokens < tokenLimit, usedTokens, tokenLimit, tier: user.tier as TierKey };
}

export async function getCachedTokenBudget(userId: string): Promise<Awaited<ReturnType<typeof checkTokenBudget>>> {
  return cacheGetOrSet(tokenBudgetCacheKey(userId), TOKEN_BUDGET_CACHE_TTL_SECONDS, () =>
    checkTokenBudget(userId),
  );
}

/**
 * Record token usage for a non-chat AI call by creating a ChatMessage
 * with chatId: null. Ensures the tokens count toward the monthly budget.
 *
 * @deprecated The monthly budget no longer reads ChatMessage.tokens —
 * checkTokenBudget aggregates AiUsageEvent instead, so writes here no longer
 * affect the ceiling. Kept (along with its callers) to avoid behavior changes;
 * prefer recording spend via AiUsageEvent for budget accounting.
 */
export async function recordTokenUsage(params: {
  notebookId: string;
  userId: string;
  tokens: number;
  description: string;
}): Promise<void> {
  await db.chatMessage.create({
    data: {
      notebookId: params.notebookId,
      userId: params.userId,
      chatId: null,
      role: 'assistant',
      content: params.description,
      tokens: params.tokens,
    },
  });
}
