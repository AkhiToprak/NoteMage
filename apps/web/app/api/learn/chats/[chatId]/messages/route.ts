import { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { getAuthUserId } from '@/lib/auth';
import { getMageName } from '@/lib/scholar';
import { db } from '@/lib/db';
import {
  successResponse,
  badRequestResponse,
  unauthorizedResponse,
  notFoundResponse,
  tooManyRequestsResponse,
  internalErrorResponse,
} from '@/lib/api-response';
import { rateLimit, rateLimitKey } from '@/lib/rate-limit';
import { checkAndUnlockAchievements } from '@/lib/achievement-checker';
import { checkTokenBudget } from '@/lib/token-budget';
import { startChatStream } from '@/lib/chat-stream';

type Params = { params: Promise<{ chatId: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { chatId } = await params;
    const chat = await db.notebookChat.findFirst({ where: { id: chatId, userId } });
    if (!chat) return notFoundResponse('Chat not found');

    const messages = await db.chatMessage.findMany({
      where: { chatId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        role: true,
        content: true,
        tokens: true,
        createdAt: true,
      },
    });

    return successResponse(messages);
  } catch {
    return internalErrorResponse();
  }
}

/**
 * POST /api/learn/chats/[chatId]/messages — send a user message in a chat
 * that may span multiple notebooks (or have no primary notebook).
 *
 * Mirrors the per-notebook route's preflight (auth → rate limit → token
 * budget → message validation) and delegates the SSE/tool logic to
 * `lib/chat-stream.ts`.
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const token = await getToken({ req: request });
    const mageName = getMageName(token?.scholarName as string | undefined);

    checkAndUnlockAchievements(userId).catch(console.error);

    const reqLimit = await rateLimit(rateLimitKey('ai-chat', request, userId), 20, 60_000);
    if (!reqLimit.success) {
      return tooManyRequestsResponse('Too many requests. Please slow down.', reqLimit.retryAfterMs);
    }

    const { chatId } = await params;

    const chat = await db.notebookChat.findFirst({ where: { id: chatId, userId } });
    if (!chat) return notFoundResponse('Chat not found');

    const { allowed: tokenAllowed, usedTokens, tokenLimit, tier } = await checkTokenBudget(userId);
    if (!tokenAllowed) {
      return tooManyRequestsResponse(
        `Monthly token limit reached (${tokenLimit.toLocaleString()} tokens). Resets on the 1st of next month.`
      );
    }

    const body = await request.json().catch(() => ({}));
    const { message } = body as { message?: string };

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return badRequestResponse('Message cannot be empty');
    }
    if (message.length > 10_000) {
      return badRequestResponse('Message is too long (max 10,000 characters)');
    }
    const userMessage = message.trim();

    // Phase 9.6 — ChatMessage.notebookId is now nullable; cross-notebook /
    // inbox-only chats pass null straight through instead of placeholder-
    // stamping with the user's Inbox notebook id.
    return startChatStream({
      request,
      userId,
      messageNotebookId: chat.notebookId,
      chat: {
        id: chat.id,
        title: chat.title,
        notebookId: chat.notebookId,
        contextPageIds: chat.contextPageIds,
        contextDocIds: chat.contextDocIds,
      },
      userMessage,
      mageName,
      usedTokens,
      tokenLimit,
      tier,
    });
  } catch (error) {
    console.error('[learn/chats/:chatId/messages POST]', error);
    return internalErrorResponse();
  }
}
