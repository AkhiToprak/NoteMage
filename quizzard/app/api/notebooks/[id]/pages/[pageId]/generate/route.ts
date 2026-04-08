import { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { getAuthUserId } from '@/lib/auth';
import { getScholarName } from '@/lib/scholar';
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
import { ALL_TOOLS, extractToolUses } from '@/lib/ai-tools';

type Params = { params: Promise<{ id: string; pageId: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const token = await getToken({ req: request });
    const scholarName = getScholarName(token?.scholarName as string | undefined);

    // Rate limit: 10 req/min
    const ip = getClientIp(request);
    const reqLimit = await rateLimit(`generate:${ip}`, 10, 60_000);
    if (!reqLimit.success) {
      return tooManyRequestsResponse('Too many requests. Please slow down.', reqLimit.retryAfterMs);
    }

    const { id: notebookId, pageId } = await params;

    // Verify notebook ownership
    const notebook = await db.notebook.findFirst({ where: { id: notebookId, userId } });
    if (!notebook) return notFoundResponse('Notebook not found');

    // Load page
    const page = await db.page.findFirst({ where: { id: pageId, section: { notebookId } } });
    if (!page) return notFoundResponse('Page not found');

    if (!page.textContent || page.textContent.trim().length === 0) {
      return badRequestResponse('Page has no text content to generate from');
    }

    // Parse body
    const body = await request.json().catch(() => ({}));
    const { type } = body as { type?: string };

    if (!type || !['flashcards', 'quiz', 'mindmap'].includes(type)) {
      return badRequestResponse('Invalid type. Must be: flashcards, quiz, or mindmap');
    }

    // Token budget check
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const tokenUsage = await db.chatMessage.aggregate({
      where: { userId, createdAt: { gte: startOfMonth }, tokens: { not: null } },
      _sum: { tokens: true },
    });
    const usedTokens = tokenUsage._sum.tokens ?? 0;
    if (usedTokens >= MONTHLY_TOKEN_LIMIT) {
      return tooManyRequestsResponse(
        `Monthly token limit reached (${MONTHLY_TOKEN_LIMIT.toLocaleString()} tokens).`
      );
    }

    // Build system prompt based on type
    let systemPrompt: string;
    if (type === 'flashcards') {
      systemPrompt =
        `You are ${scholarName}, an AI study assistant. The user wants you to create flashcards from the provided page content. Use the create_flashcards tool to generate high-quality flashcards covering the key concepts. Create clear questions and concise answers.`;
    } else if (type === 'quiz') {
      systemPrompt =
        `You are ${scholarName}, an AI study assistant. The user wants you to create a quiz from the provided page content. Use the create_quiz tool to generate challenging but fair multiple-choice questions. Always provide hints and explanations.`;
    } else {
      systemPrompt =
        `You are ${scholarName}, an AI study assistant. The user wants you to create a mind map from the provided page content. Use the create_mindmap tool to create a well-structured mind map using Markdown heading hierarchy.`;
    }

    // Call Anthropic
    const response = await anthropic.messages.create({
      model: AI_MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Generate ${type} from this content:\n\n${page.textContent.slice(0, 15000)}`,
        },
      ],
      tools: ALL_TOOLS,
    });

    const totalTokens = response.usage.input_tokens + response.usage.output_tokens;
    const { text, flashcard, quiz, mindmap } = extractToolUses(response.content);

    // Track token usage (chatId is nullable in schema)
    await db.chatMessage.create({
      data: {
        notebookId,
        userId,
        chatId: null,
        role: 'assistant',
        content: `[auto-generated ${type} from page "${page.title}"]`,
        tokens: totalTokens,
      },
    });

    // Handle flashcard creation
    if (type === 'flashcards' && flashcard) {
      const { title, flashcards } = flashcard.input;
      if (title && Array.isArray(flashcards) && flashcards.length > 0) {
        const fSet = await db.flashcardSet.create({
          data: {
            notebookId,
            title,
            source: 'ai',
            flashcards: {
              create: flashcards.map((fc, i) => ({
                question: fc.question,
                answer: fc.answer,
                sortOrder: i,
              })),
            },
          },
          include: { flashcards: true },
        });
        return successResponse({
          type: 'flashcards',
          flashcardSet: { id: fSet.id, title: fSet.title, cardCount: fSet.flashcards.length },
          usage: {
            totalTokens,
            monthlyUsed: usedTokens + totalTokens,
            monthlyLimit: MONTHLY_TOKEN_LIMIT,
          },
        });
      }
    }

    // Handle quiz creation
    if (type === 'quiz' && quiz) {
      const { title, questions } = quiz.input;
      if (title && Array.isArray(questions) && questions.length > 0) {
        // Fisher-Yates shuffle to randomize answer positions
        for (const q of questions) {
          let correctIdx = q.correctIndex;
          for (let i = q.options.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [q.options[i], q.options[j]] = [q.options[j], q.options[i]];
            if (correctIdx === i) correctIdx = j;
            else if (correctIdx === j) correctIdx = i;
          }
          q.correctIndex = correctIdx;
        }

        const qSet = await db.quizSet.create({
          data: {
            notebookId,
            title,
            questions: {
              create: questions.map((q, i) => ({
                question: q.question,
                options: q.options,
                correctIndex: q.correctIndex,
                hint: q.hint ?? null,
                correctExplanation: q.correctExplanation ?? null,
                wrongExplanation: q.wrongExplanation ?? null,
                sortOrder: i,
              })),
            },
          },
          include: { questions: true },
        });
        return successResponse({
          type: 'quiz',
          quizSet: { id: qSet.id, title: qSet.title, questionCount: qSet.questions.length },
          usage: {
            totalTokens,
            monthlyUsed: usedTokens + totalTokens,
            monthlyLimit: MONTHLY_TOKEN_LIMIT,
          },
        });
      }
    }

    // Handle mindmap
    if (type === 'mindmap' && mindmap) {
      return successResponse({
        type: 'mindmap',
        mindmap: { title: mindmap.input.title, markdown: mindmap.input.markdown },
        usage: {
          totalTokens,
          monthlyUsed: usedTokens + totalTokens,
          monthlyLimit: MONTHLY_TOKEN_LIMIT,
        },
      });
    }

    // Fallback: tool wasn't used, return text
    return successResponse({
      type,
      text: text || 'Could not generate content. Please try again.',
      usage: {
        totalTokens,
        monthlyUsed: usedTokens + totalTokens,
        monthlyLimit: MONTHLY_TOKEN_LIMIT,
      },
    });
  } catch (error: unknown) {
    console.error('[Generate] Error:', error);
    if (error && typeof error === 'object' && 'status' in error) {
      const apiError = error as { status: number };
      if (apiError.status === 429)
        return tooManyRequestsResponse('AI service rate limit. Please wait.');
      if (apiError.status === 529 || apiError.status === 503)
        return internalErrorResponse('AI service temporarily overloaded.');
    }
    return internalErrorResponse();
  }
}
