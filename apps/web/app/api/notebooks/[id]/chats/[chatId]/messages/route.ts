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
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { checkAndUnlockAchievements } from '@/lib/achievement-checker';
import { checkTokenBudget } from '@/lib/token-budget';
import { startChatStream } from '@/lib/chat-stream';

type Params = { params: Promise<{ id: string; chatId: string }> };

/**
 * GET – list messages for a chat (paginated if needed later)
 */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: notebookId, chatId } = await params;

    const notebook = await db.notebook.findFirst({ where: { id: notebookId, userId } });
    if (!notebook) return notFoundResponse('Notebook not found');

    const chat = await db.notebookChat.findFirst({ where: { id: chatId, notebookId } });
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
 * POST – send a user message and get an AI response
 *
 * Phase 9.2: stream/tool logic lives in `lib/chat-stream.ts` so the new
 * `/api/learn/chats/[chatId]/messages` route can share it. This route keeps
 * the notebook-scoped ownership check.
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const token = await getToken({ req: request });
    const mageName = getMageName(token?.scholarName as string | undefined);

    checkAndUnlockAchievements(userId).catch(console.error);

    const ip = getClientIp(request);
    const reqLimit = await rateLimit(`ai-chat:${ip}`, 20, 60_000);
    if (!reqLimit.success) {
      return tooManyRequestsResponse('Too many requests. Please slow down.', reqLimit.retryAfterMs);
    }

    const { id: notebookId, chatId } = await params;

    const notebook = await db.notebook.findFirst({ where: { id: notebookId, userId } });
    if (!notebook) return notFoundResponse('Notebook not found');

    const chat = await db.notebookChat.findFirst({ where: { id: chatId, notebookId } });
    if (!chat) return notFoundResponse('Chat not found');

    const { allowed: tokenAllowed, usedTokens, tokenLimit } = await checkTokenBudget(userId);
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

    return startChatStream({
      request,
      userId,
      messageNotebookId: notebookId,
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
    });
  } catch (error: unknown) {
    console.error('[AI Chat] Error:', error);
    return internalErrorResponse();
  }
}
