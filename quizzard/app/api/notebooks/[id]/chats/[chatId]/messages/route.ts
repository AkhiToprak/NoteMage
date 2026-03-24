import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { anthropic, AI_MODEL, MONTHLY_TOKEN_LIMIT } from '@/lib/anthropic';
import {
  successResponse,
  badRequestResponse,
  unauthorizedResponse,
  notFoundResponse,
  tooManyRequestsResponse,
  internalErrorResponse,
} from '@/lib/api-response';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

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
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    // Per-IP request rate limit: 20 requests per minute
    const ip = getClientIp(request);
    const reqLimit = rateLimit(`ai-chat:${ip}`, 20, 60_000);
    if (!reqLimit.success) {
      return tooManyRequestsResponse('Too many requests. Please slow down.', reqLimit.retryAfterMs);
    }

    const { id: notebookId, chatId } = await params;

    const notebook = await db.notebook.findFirst({ where: { id: notebookId, userId } });
    if (!notebook) return notFoundResponse('Notebook not found');

    const chat = await db.notebookChat.findFirst({ where: { id: chatId, notebookId } });
    if (!chat) return notFoundResponse('Chat not found');

    // ── Token budget check (1M tokens/month per user) ──
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const tokenUsage = await db.chatMessage.aggregate({
      where: {
        userId,
        createdAt: { gte: startOfMonth },
        tokens: { not: null },
      },
      _sum: { tokens: true },
    });

    const usedTokens = tokenUsage._sum.tokens ?? 0;
    if (usedTokens >= MONTHLY_TOKEN_LIMIT) {
      return tooManyRequestsResponse(
        `Monthly token limit reached (${MONTHLY_TOKEN_LIMIT.toLocaleString()} tokens). Resets on the 1st of next month.`
      );
    }

    // ── Parse user message ──
    const body = await request.json().catch(() => ({}));
    const { message } = body as { message?: string };

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return badRequestResponse('Message cannot be empty');
    }
    if (message.length > 10_000) {
      return badRequestResponse('Message is too long (max 10,000 characters)');
    }

    // ── Build context from selected pages & documents ──
    const contextParts: string[] = [];

    if (chat.contextPageIds.length > 0) {
      const pages = await db.page.findMany({
        where: { id: { in: chat.contextPageIds } },
        select: { title: true, textContent: true },
      });
      for (const page of pages) {
        if (page.textContent) {
          contextParts.push(`[Page: ${page.title}]\n${page.textContent}`);
        }
      }
    }

    if (chat.contextDocIds.length > 0) {
      const docs = await db.document.findMany({
        where: { id: { in: chat.contextDocIds } },
        select: { fileName: true, textContent: true },
      });
      for (const doc of docs) {
        if (doc.textContent) {
          contextParts.push(`[Document: ${doc.fileName}]\n${doc.textContent}`);
        }
      }
    }

    // ── Load conversation history ──
    const history = await db.chatMessage.findMany({
      where: { chatId },
      orderBy: { createdAt: 'asc' },
      select: { role: true, content: true },
    });

    const conversationMessages = history.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    // Add the new user message
    conversationMessages.push({ role: 'user', content: message.trim() });

    // ── Build system prompt ──
    const systemParts = [
      'You are Scholar, an AI study assistant embedded in the Quizzard notebook app.',
      'Help the user study, understand, and review their notes and documents.',
      'Be concise, clear, and educational. Use markdown formatting when helpful.',
    ];

    if (contextParts.length > 0) {
      systemParts.push(
        '\nThe user has provided the following context from their notebook:\n',
        contextParts.join('\n\n---\n\n')
      );
    }

    // ── Call Anthropic API ──
    const response = await anthropic.messages.create({
      model: AI_MODEL,
      max_tokens: 2048,
      system: systemParts.join('\n'),
      messages: conversationMessages,
    });

    const assistantContent =
      response.content[0].type === 'text' ? response.content[0].text : '';

    const totalTokens = response.usage.input_tokens + response.usage.output_tokens;

    // ── Persist both messages to DB ──
    const [userMsg, assistantMsg] = await db.$transaction([
      db.chatMessage.create({
        data: {
          notebookId,
          userId,
          chatId,
          role: 'user',
          content: message.trim(),
          tokens: response.usage.input_tokens,
        },
      }),
      db.chatMessage.create({
        data: {
          notebookId,
          userId,
          chatId,
          role: 'assistant',
          content: assistantContent,
          tokens: response.usage.output_tokens,
        },
      }),
    ]);

    // Touch chat updatedAt
    await db.notebookChat.update({
      where: { id: chatId },
      data: { updatedAt: new Date() },
    });

    return successResponse({
      userMessage: {
        id: userMsg.id,
        role: userMsg.role,
        content: userMsg.content,
        createdAt: userMsg.createdAt,
      },
      assistantMessage: {
        id: assistantMsg.id,
        role: assistantMsg.role,
        content: assistantMsg.content,
        createdAt: assistantMsg.createdAt,
      },
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        totalTokens,
        monthlyUsed: usedTokens + totalTokens,
        monthlyLimit: MONTHLY_TOKEN_LIMIT,
      },
    });
  } catch (error: unknown) {
    console.error('[AI Chat] Error:', error);

    // Surface Anthropic API errors with useful messages
    if (error && typeof error === 'object' && 'status' in error) {
      const apiError = error as { status: number; error?: { message?: string } };
      const msg = apiError.error?.message ?? 'AI service error';

      if (apiError.status === 400 && msg.includes('credit balance')) {
        return badRequestResponse('AI service billing issue. Please check your Anthropic API credits.');
      }
      if (apiError.status === 401) {
        return badRequestResponse('Invalid Anthropic API key. Please check your configuration.');
      }
      if (apiError.status === 429) {
        return tooManyRequestsResponse('AI service rate limit reached. Please wait a moment and try again.');
      }
      if (apiError.status === 529 || apiError.status === 503) {
        return internalErrorResponse('AI service is temporarily overloaded. Please try again in a moment.');
      }
    }

    return internalErrorResponse();
  }
}
