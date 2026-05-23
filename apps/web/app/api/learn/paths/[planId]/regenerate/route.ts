import { NextRequest } from 'next/server';
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
      select: { id: true, generationStatus: true },
    });
    if (!plan) return notFoundResponse('Path not found');

    // Block double-fires while a previous run is still in flight.
    if (plan.generationStatus === 'generating') {
      return badRequestResponse('Generation is already in progress');
    }

    await db.studyPlan.update({
      where: { id: planId },
      data: {
        generationStatus: 'generating',
        generationError: null,
      },
    });

    void generatePath(planId).catch((err) => {
      console.error('[learn/paths regenerate]', err);
    });

    return successResponse({ planId, status: 'generating' });
  } catch (error) {
    console.error('[learn/paths regenerate]', error);
    return internalErrorResponse();
  }
}
