import { db } from '@/lib/db';
import { MONTHLY_TOKEN_LIMIT } from '@/lib/anthropic';

/**
 * Check whether a user has exceeded their monthly token budget.
 */
export async function checkTokenBudget(userId: string): Promise<{
  allowed: boolean;
  usedTokens: number;
}> {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const tokenUsage = await db.chatMessage.aggregate({
    where: { userId, createdAt: { gte: startOfMonth }, tokens: { not: null } },
    _sum: { tokens: true },
  });

  const usedTokens = tokenUsage._sum.tokens ?? 0;
  return { allowed: usedTokens < MONTHLY_TOKEN_LIMIT, usedTokens };
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
