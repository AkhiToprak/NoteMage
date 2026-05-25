import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  successResponse,
  unauthorizedResponse,
  notFoundResponse,
  internalErrorResponse,
  badRequestResponse,
  tooManyRequestsResponse,
} from '@/lib/api-response';
import { translatePath } from '@/lib/path-translator';
import { isPathLanguage } from '@/lib/path-languages';
import { checkTokenBudget } from '@/lib/token-budget';
import { rateLimit, rateLimitKey } from '@/lib/rate-limit';

// Translate an existing path IN PLACE into another language. Progress is
// preserved because only text columns on the existing rows change (see
// path-translator.ts). Like regenerate this re-fires expensive AI work, so it
// does NOT consume a study-plan credit — it's guarded by a rate limit + the
// monthly token budget instead. The client reconnects to `/generation` SSE
// (or the list poll) to watch the run; the card shows a "Translating…" state
// via generationProgress.mode.

type Params = { params: Promise<{ planId: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const rl = await rateLimit(rateLimitKey('path-translate', request, userId), 10, 60_000);
    if (!rl.success) {
      return tooManyRequestsResponse(
        'Too many translation attempts. Please wait a moment and try again.',
        rl.retryAfterMs,
      );
    }

    const { allowed: tokenAllowed, tokenLimit } = await checkTokenBudget(userId);
    if (!tokenAllowed) {
      return tooManyRequestsResponse(
        `Monthly token limit reached (${tokenLimit.toLocaleString()} tokens). Resets on the 1st of next month.`,
      );
    }

    const body = (await request.json().catch(() => ({}))) as { language?: unknown };
    if (!isPathLanguage(body.language)) {
      return badRequestResponse('Unsupported or missing target language');
    }
    const language = body.language;

    const { planId } = await params;
    const plan = await db.studyPlan.findFirst({
      where: { id: planId, userId },
      select: { id: true, generationStatus: true, language: true },
    });
    if (!plan) return notFoundResponse('Path not found');

    // Block double-fires while a previous run (generation or translation) is
    // still in flight — translating a half-written path would corrupt it.
    if (plan.generationStatus === 'generating') {
      return badRequestResponse('This path is still being worked on. Try again in a moment.');
    }

    // Note: we deliberately allow `language === plan.language`. Re-translating
    // a path into its own language is a "fix mixed content" pass — it cleans up
    // any text that generated in another language (e.g. English fragments in a
    // German path) while leaving already-correct strings untouched.

    // Flip into the working state with a translate-mode progress stub so the
    // list card flips to "Translating…" immediately, before the orchestrator
    // writes its first progress tick.
    await db.studyPlan.update({
      where: { id: planId },
      data: {
        generationStatus: 'generating',
        generationError: null,
        generationProgress: {
          mode: 'translate',
          totalSlots: 0,
          completedSlots: 0,
          currentSlot: null,
          currentActivity: null,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    void translatePath(planId, language).catch((err) => {
      console.error('[learn/paths translate]', err);
    });

    return successResponse({ planId, language, status: 'generating' });
  } catch (error) {
    console.error('[learn/paths translate]', error);
    return internalErrorResponse();
  }
}
