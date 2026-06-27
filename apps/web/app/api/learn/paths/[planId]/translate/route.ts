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
import { isPathLanguage } from '@/lib/path-languages';
import { checkTokenBudget } from '@/lib/token-budget';
import { costRateLimit, rateLimitKey } from '@/lib/rate-limit';
import { reserveUsage, refundUsage } from '@/lib/usage-limits';
import { invalidateDashboardCache } from '@/lib/dashboard-data';
import { enqueueJob } from '@/lib/background-jobs';

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

    // Cost-aware limiter (fails CLOSED in prod so a Redis outage can't uncap
    // the AI translation COGS).
    const rl = await costRateLimit(rateLimitKey('path-translate', request, userId), 10, 60_000);
    if (!rl.success) {
      return tooManyRequestsResponse(
        'Too many translation attempts. Please wait a moment and try again.',
        rl.retryAfterMs
      );
    }

    // Reserve a path_translate credit (atomic check-and-charge). Admins and
    // unlimited tiers pass without consuming. Every early return below aborts
    // before translatePath fires, so each refunds the reserved credit.
    const reservation = await reserveUsage(userId, 'path_translate');
    if (!reservation.allowed) {
      return tooManyRequestsResponse(
        'Monthly translation limit reached. Please try again next month.'
      );
    }

    const { allowed: tokenAllowed, tokenLimit } = await checkTokenBudget(userId);
    if (!tokenAllowed) {
      await refundUsage(userId, 'path_translate');
      return tooManyRequestsResponse(
        `Monthly token limit reached (${tokenLimit.toLocaleString()} tokens). Resets on the 1st of next month.`
      );
    }

    const body = (await request.json().catch(() => ({}))) as { language?: unknown };
    if (!isPathLanguage(body.language)) {
      await refundUsage(userId, 'path_translate');
      return badRequestResponse('Unsupported or missing target language');
    }
    const language = body.language;

    const { planId } = await params;
    const plan = await db.studyPlan.findFirst({
      where: { id: planId, userId },
      select: { id: true, generationStatus: true, language: true },
    });
    if (!plan) {
      await refundUsage(userId, 'path_translate');
      return notFoundResponse('Path not found');
    }

    // Block double-fires while a previous run (generation or translation) is
    // still in flight — translating a half-written path would corrupt it.
    if (plan.generationStatus === 'generating') {
      await refundUsage(userId, 'path_translate');
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
    await invalidateDashboardCache(userId);

    try {
      await enqueueJob(
        'path.translate',
        { planId, language },
        { dedupeKey: `path:translate:${planId}:${language}` }
      );
    } catch (error) {
      await refundUsage(userId, 'path_translate');
      await db.studyPlan
        .update({
          where: { id: planId },
          data: {
            generationStatus: 'failed',
            generationError: 'Could not start translation. Please try again.',
          },
        })
        .catch(() => {});
      throw error;
    }

    return successResponse({ planId, language, status: 'generating' });
  } catch (error) {
    console.error('[learn/paths translate]', error);
    return internalErrorResponse();
  }
}
