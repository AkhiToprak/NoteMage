import { NextRequest } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import type Anthropic from '@anthropic-ai/sdk';
import { getToken } from 'next-auth/jwt';
import { getAuthUserId } from '@/lib/auth';
import { getMageName } from '@/lib/scholar';
import { db } from '@/lib/db';
import { anthropic, AI_MODEL, MAX_OUTPUT_TOKENS, MAX_CONTEXT_CHARS } from '@/lib/anthropic';
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
import { buildLegacyColumns } from '@/lib/quiz-grading';
import { QuizSetV2Schema } from '@notemage/shared';
import { checkTokenBudget } from '@/lib/token-budget';
import { checkUsageLimit, incrementUsage } from '@/lib/usage-limits';

type Params = { params: Promise<{ id: string; pageId: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const token = await getToken({ req: request });
    const mageName = getMageName(token?.scholarName as string | undefined);

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

    // Token budget check (per-tier monthly limit)
    const { allowed: tokenAllowed, usedTokens, tokenLimit } = await checkTokenBudget(userId);
    if (!tokenAllowed) {
      return tooManyRequestsResponse(
        `Monthly token limit reached (${tokenLimit.toLocaleString()} tokens).`
      );
    }

    // Per-feature monthly quota (flashcards & quizzes; mind maps are uncapped)
    const usageFeature =
      type === 'flashcards' ? 'ai_flashcards' : type === 'quiz' ? 'ai_quizzes' : null;
    if (usageFeature) {
      const usage = await checkUsageLimit(userId, usageFeature);
      if (!usage.allowed) {
        const label = type === 'flashcards' ? 'flashcard' : 'quiz';
        return tooManyRequestsResponse(
          `Monthly ${label} generation limit reached (${usage.limit}). Upgrade to Pro for unlimited.`
        );
      }
    }

    // Build system prompt based on type
    let systemPrompt: string;
    if (type === 'flashcards') {
      systemPrompt = `You are ${mageName}, an AI study assistant. The user wants you to create flashcards from the provided page content. Use the create_flashcards tool to generate high-quality flashcards covering the key concepts. Create clear questions and concise answers.`;
    } else if (type === 'quiz') {
      systemPrompt = `You are ${mageName}, an AI study assistant. The user wants you to create a quiz from the provided page content. Use the create_quiz_v2 tool to generate challenging but fair questions. Mix kinds intentionally across the quiz (mc, fill_blank, word_bank, match_pairs, translation, sentence_reorder, equation) — see the tool description for each kind's payload shape. Avoid all-MC unless the material is purely factual. Always provide hints and explanations for every question.`;
    } else {
      systemPrompt = `You are ${mageName}, an AI study assistant. The user wants you to create a mind map from the provided page content. Use the create_mindmap tool to create a well-structured mind map using Markdown heading hierarchy.`;
    }

    // P2 — split the system payload so the page corpus is cached.
    // Order matters: corpus block first (cached), instructions second
    // (uncached). The instructions differ per `type` (flashcards / quiz
    // / mindmap), but the corpus is byte-identical when the user
    // generates a quiz and then a flashcard set from the same page —
    // the common page-detail toolbar flow. Putting the corpus first
    // means the cache key is the corpus alone, so the second call
    // within the 5-minute ephemeral TTL reads it from the cache even
    // though the instruction block changed. Same pattern as
    // path-prompts.ts `buildCachedSystem` (corpus-first), not
    // chat-stream.ts (instructions-first, because chat instructions
    // are stable across turns).
    const corpus = page.textContent.slice(0, MAX_CONTEXT_CHARS);
    const systemBlocks: Anthropic.Messages.TextBlockParam[] = [
      {
        type: 'text',
        text: `[Page: ${page.title}]\n\n${corpus}`,
        cache_control: { type: 'ephemeral' },
      },
      { type: 'text', text: systemPrompt },
    ];

    // Call Anthropic
    const response = await anthropic.messages.create({
      model: AI_MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: systemBlocks,
      messages: [
        {
          role: 'user',
          content: `Generate ${type} from the page provided above.`,
        },
      ],
      tools: ALL_TOOLS,
    });

    const totalTokens = response.usage.input_tokens + response.usage.output_tokens;
    const { text, flashcard, quiz, quizV2, mindmap } = extractToolUses(response.content);

    // P2 — record cache hit/miss so we can verify the savings in
    // Sentry. On the first call for a page the corpus shows up as
    // `cacheCreationTokens`; on the follow-up call (same page,
    // different `type`) within the 5-minute TTL it shows up as
    // `cacheReadTokens` and `inputTokens` collapses to the small
    // instruction + user-message footprint.
    const cacheReadTokens = response.usage.cache_read_input_tokens ?? 0;
    const cacheCreationTokens = response.usage.cache_creation_input_tokens ?? 0;
    Sentry.addBreadcrumb({
      category: 'page-generate',
      level: 'info',
      message: 'page generate anthropic usage',
      data: {
        notebookId,
        pageId,
        type,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        cacheReadTokens,
        cacheCreationTokens,
        corpusChars: corpus.length,
      },
    });

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
            userId,
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
        await incrementUsage(userId, 'ai_flashcards');
        return successResponse({
          type: 'flashcards',
          flashcardSet: { id: fSet.id, title: fSet.title, cardCount: fSet.flashcards.length },
          usage: {
            totalTokens,
            monthlyUsed: usedTokens + totalTokens,
            monthlyLimit: tokenLimit,
          },
        });
      }
    }

    // Handle quiz creation (V2 — kind-aware)
    if (type === 'quiz' && quizV2) {
      const { title, questions } = quizV2.input;

      // MC-only shuffle: randomize answer positions so the correct index
      // isn't always 0. Non-MC kinds aren't shuffled here.
      for (const q of questions) {
        if (q.kind !== 'mc') continue;
        const mcPayload = q.payload;
        let correctIdx = mcPayload.correctIndex;
        for (let i = mcPayload.options.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [mcPayload.options[i], mcPayload.options[j]] = [
            mcPayload.options[j],
            mcPayload.options[i],
          ];
          if (correctIdx === i) correctIdx = j;
          else if (correctIdx === j) correctIdx = i;
        }
        mcPayload.correctIndex = correctIdx;
      }

      const parsed = QuizSetV2Schema.safeParse({ title, questions });
      if (!parsed.success) {
        return badRequestResponse('AI returned an invalid quiz');
      }

      const qSet = await db.quizSet.create({
        data: {
          userId,
          notebookId,
          title,
          questions: {
            create: parsed.data.questions.map((q, i) => ({
              kind: q.kind,
              payload: q.payload,
              question: q.prompt,
              ...buildLegacyColumns(q.kind, q.payload),
              hint: q.hint ?? null,
              correctExplanation: q.correctExplanation ?? null,
              wrongExplanation: q.wrongExplanation ?? null,
              sortOrder: i,
            })),
          },
        },
        include: { questions: true },
      });
      await incrementUsage(userId, 'ai_quizzes');
      return successResponse({
        type: 'quiz',
        quizSet: { id: qSet.id, title: qSet.title, questionCount: qSet.questions.length },
        usage: {
          totalTokens,
          monthlyUsed: usedTokens + totalTokens,
          monthlyLimit: tokenLimit,
        },
      });
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
            userId,
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
        await incrementUsage(userId, 'ai_quizzes');
        return successResponse({
          type: 'quiz',
          quizSet: { id: qSet.id, title: qSet.title, questionCount: qSet.questions.length },
          usage: {
            totalTokens,
            monthlyUsed: usedTokens + totalTokens,
            monthlyLimit: tokenLimit,
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
          monthlyLimit: tokenLimit,
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
        monthlyLimit: tokenLimit,
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
