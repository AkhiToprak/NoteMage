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
import { generatePath } from '@/lib/path-generator';
import { checkTokenBudget } from '@/lib/token-budget';
import { rateLimit, rateLimitKey } from '@/lib/rate-limit';

// Phase 10.3 — retry path-generation. `generatePath` is idempotent
// (skips activity kinds the slot already has), so this endpoint just
// flips the plan back into the `generating` state and re-fires the
// orchestrator. The client should reconnect to `/generation` SSE to
// watch the retry stream.

type Params = { params: Promise<{ planId: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    // Anti-abuse: regenerate re-fires a full (expensive) Stage-B generation.
    // It deliberately does NOT consume an ai_study_plan credit (the plan
    // already cost one when it was created), so guard it with a rate limit +
    // the monthly token budget so it can't be used to burn tokens without bound.
    const rl = await rateLimit(rateLimitKey('path-regenerate', request, userId), 10, 60_000);
    if (!rl.success) {
      return tooManyRequestsResponse(
        'Too many regeneration attempts. Please wait a moment and try again.',
        rl.retryAfterMs
      );
    }

    const { allowed: tokenAllowed, tokenLimit } = await checkTokenBudget(userId);
    if (!tokenAllowed) {
      return tooManyRequestsResponse(
        `Monthly token limit reached (${tokenLimit.toLocaleString()} tokens). Resets on the 1st of next month.`
      );
    }

    const { planId } = await params;
    const plan = await db.studyPlan.findFirst({
      where: { id: planId, userId },
      select: { id: true },
    });
    if (!plan) return notFoundResponse('Path not found');

    // Atomically claim the run: the conditional updateMany only matches when the
    // plan isn't already generating, so two concurrent regenerates (e.g. a
    // double-click) can't both fire generatePath — exactly one wins. This also
    // clears the prior run's progress snapshot, otherwise the /generation SSE
    // replays a stale "N / N" to the modal before the scoped regenerate progress
    // lands and that flash reads as "regenerating the whole path". The modal
    // falls back to its targetCount until the first real write.
    const claimed = await db.studyPlan.updateMany({
      where: { id: planId, userId, generationStatus: { not: 'generating' } },
      data: {
        generationStatus: 'generating',
        generationError: null,
        generationProgress: Prisma.DbNull,
      },
    });
    if (claimed.count === 0) {
      return badRequestResponse('Generation is already in progress');
    }

    void generatePath(planId).catch((err) => {
      console.error('[learn/paths regenerate]', err);
    });

    return successResponse({ planId, status: 'generating' });
  } catch (error) {
    console.error('[learn/paths regenerate]', error);
    return internalErrorResponse();
  }
}
