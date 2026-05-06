import { db } from '@/lib/db';
import { TIERS, getMonthStart } from '@/lib/tiers';
import type { TierKey } from '@/lib/tiers';

/**
 * Check whether a user has exceeded their monthly token budget.
 * The limit is tier-aware: each tier has its own tokenLimit defined in TIERS.
 * Admins bypass the token budget entirely.
 */
export async function checkTokenBudget(userId: string): Promise<{
  allowed: boolean;
  usedTokens: number;
  tokenLimit: number; // -1 = unlimited (admin)
}> {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { tier: true, role: true },
  });

  // Admins bypass token limits
  if (user.role === 'admin') {
    return { allowed: true, usedTokens: 0, tokenLimit: -1 };
  }

  const tierConfig = TIERS[user.tier as TierKey];
  const tokenLimit = tierConfig.tokenLimit;

  const startOfMonth = getMonthStart();

  const tokenUsage = await db.chatMessage.aggregate({
    where: { userId, createdAt: { gte: startOfMonth }, tokens: { not: null } },
    _sum: { tokens: true },
  });

  const usedTokens = tokenUsage._sum.tokens ?? 0;
  return { allowed: usedTokens < tokenLimit, usedTokens, tokenLimit };
}

/**
 * Record token usage for a non-chat AI call by creating a ChatMessage
 * with chatId: null. Ensures the tokens count toward the monthly budget.
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
