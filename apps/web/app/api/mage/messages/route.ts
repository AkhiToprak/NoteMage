import { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { getAuthUserId } from '@/lib/auth';
import { getMageName } from '@/lib/scholar';
import { db } from '@/lib/db';
import {
  badRequestResponse,
  unauthorizedResponse,
  tooManyRequestsResponse,
  internalErrorResponse,
} from '@/lib/api-response';
import { costRateLimit, rateLimitKey } from '@/lib/rate-limit';
import { checkAndUnlockAchievements } from '@/lib/achievement-checker';
import { checkTokenBudget } from '@/lib/token-budget';
import { startChatStream } from '@/lib/chat-stream';
import { expandMageContext } from '@/lib/mage-context';
import type { MageClientContext } from '@/lib/mage-types';

/**
 * POST /api/mage/messages — the global Mage panel's send endpoint.
 *
 * Phase 1 (Foundation): mirrors the per-chat preflight (auth → rate limit →
 * token budget → message validation), authorizes the thin client context via
 * `expandMageContext` (dropping ids the user doesn't own), then delegates to
 * `startChatStream` UNCHANGED — a plain chat with no grounding, citations, or
 * action annotations yet (those land in Phases 2/4/6).
 *
 * The panel has no notebook home, so it streams against a plain `NotebookChat`
 * (notebookId = null). The thread id is returned in `X-Mage-Chat-Id` so the
 * client can keep talking to the same thread for the session; per-context
 * persistent resume arrives in Phase 10 (`NotebookChat.contextKey`).
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const token = await getToken({ req: request });
    const mageName = getMageName(token?.scholarName as string | undefined);

    checkAndUnlockAchievements(userId).catch(console.error);

    const reqLimit = await costRateLimit(rateLimitKey('ai-chat', request, userId), 20, 60_000);
    if (!reqLimit.success) {
      return tooManyRequestsResponse('Too many requests. Please slow down.', reqLimit.retryAfterMs);
    }

    const { allowed: tokenAllowed, usedTokens, tokenLimit, tier } = await checkTokenBudget(userId);
    if (!tokenAllowed) {
      return tooManyRequestsResponse(
        `Monthly token limit reached (${tokenLimit.toLocaleString()} tokens). Resets on the 1st of next month.`
      );
    }

    const body = await request.json().catch(() => ({}));
    const { message, chatId, context } = body as {
      message?: string;
      chatId?: string;
      context?: MageClientContext;
    };

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return badRequestResponse('Message cannot be empty');
    }
    if (message.length > 10_000) {
      return badRequestResponse('Message is too long (max 10,000 characters)');
    }
    const userMessage = message.trim();

    // Authorize the client context (drops unauthorized ids) + derive the
    // server-authoritative policy/action menu. Never fatal — on failure we
    // fall back to a plain global turn.
    const resolved = await expandMageContext(userId, context ?? null, { tier }).catch((err) => {
      console.error('[mage/messages] context resolution failed', err);
      return null;
    });

    // Find-or-create the panel's thread. An unknown / non-owned chatId quietly
    // starts a fresh thread rather than 404-ing the panel.
    let chat =
      typeof chatId === 'string' && chatId.length > 0
        ? await db.notebookChat.findFirst({ where: { id: chatId, userId } })
        : null;
    if (!chat) {
      chat = await db.notebookChat.create({
        data: { userId, notebookId: null, title: 'New Chat' },
      });
    }

    const response = await startChatStream({
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

    // Surface the thread id so the client keeps talking to the same chat, plus
    // a summary of the resolved context for observability (action cards render
    // in Phase 6 — here the menu is only derived + exposed).
    response.headers.set('X-Mage-Chat-Id', chat.id);
    if (resolved) {
      response.headers.set('X-Mage-Context-Type', resolved.type);
      response.headers.set('X-Mage-Assistance-Policy', resolved.assistancePolicy);
      if (resolved.allowedActions.length > 0) {
        response.headers.set('X-Mage-Actions', resolved.allowedActions.join(','));
      }
    }
    return response;
  } catch (error) {
    console.error('[mage/messages POST]', error);
    return internalErrorResponse();
  }
}
