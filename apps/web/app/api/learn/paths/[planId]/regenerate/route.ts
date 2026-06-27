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
import { staleGenerationCutoff } from '@/lib/path-loader';
import { checkTokenBudget } from '@/lib/token-budget';
import { costRateLimit, rateLimitKey } from '@/lib/rate-limit';
import { reserveUsage, refundUsage } from '@/lib/usage-limits';
import { invalidateDashboardCache } from '@/lib/dashboard-data';
import { enqueueJob } from '@/lib/background-jobs';

// Phase 10.3 — retry path-generation. The path-generation worker is idempotent
// (skips activity kinds the slot already has), so this endpoint just
// flips the plan back into the `generating` state and re-queues the
// orchestrator. The client should reconnect to `/generation` SSE to
// watch the retry stream.

type Params = { params: Promise<{ planId: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    // Anti-abuse: regenerate re-fires a full (expensive) Stage-B generation.
    // It deliberately does NOT consume an ai_study_plan credit (the plan
    // already cost one when it was created), so guard it with a cost-aware
    // rate limit (fails CLOSED in prod so a Redis outage can't uncap COGS), a
    // dedicated per-feature anti-abuse meter, and the monthly token budget so
    // it can't be used to burn tokens without bound.
    const rl = await costRateLimit(rateLimitKey('path-regenerate', request, userId), 10, 60_000);
    if (!rl.success) {
      return tooManyRequestsResponse(
        'Too many regeneration attempts. Please wait a moment and try again.',
        rl.retryAfterMs
      );
    }

    // Reserve a path_regenerate credit (atomic check-and-charge). Admins and
    // unlimited tiers pass without consuming. If the run later fails to start
    // (lost claim below), the credit is refunded so a no-op doesn't burn it.
    const reservation = await reserveUsage(userId, 'path_regenerate');
    if (!reservation.allowed) {
      return tooManyRequestsResponse(
        'Monthly regeneration limit reached. Please try again next month.'
      );
    }

    const { allowed: tokenAllowed, tokenLimit } = await checkTokenBudget(userId);
    if (!tokenAllowed) {
      // Reservation charged above but no run started — return the credit.
      await refundUsage(userId, 'path_regenerate');
      return tooManyRequestsResponse(
        `Monthly token limit reached (${tokenLimit.toLocaleString()} tokens). Resets on the 1st of next month.`
      );
    }

    const { planId } = await params;
    const plan = await db.studyPlan.findFirst({
      where: { id: planId, userId },
      select: { id: true },
    });
    if (!plan) {
      // Reservation charged above but no run started — return the credit.
      await refundUsage(userId, 'path_regenerate');
      return notFoundResponse('Path not found');
    }

    // Atomically claim the run: the conditional updateMany matches only when the
    // plan isn't actively generating — either it's idle/failed/ready, or it's a
    // `generating` row whose orchestrator has gone stale (died mid-run, e.g. a
    // redeploy killed the detached generatePath). So two concurrent regenerates
    // of a LIVE run (e.g. a double-click) can't both fire generatePath — exactly
    // one wins — while a dead/stale run stays recoverable instead of bricking the
    // path forever. This also clears the prior run's progress snapshot, otherwise
    // the /generation SSE replays a stale "N / N" to the modal before the scoped
    // regenerate progress lands and that flash reads as "regenerating the whole
    // path". The modal falls back to its targetCount until the first real write.
    const claimed = await db.studyPlan.updateMany({
      where: {
        id: planId,
        userId,
        OR: [
          { generationStatus: { not: 'generating' } },
          // Reclaim a dead orchestrator: a live run bumps `updatedAt` on every
          // progress write, so a `generating` row this stale means the process
          // died mid-run and the path is otherwise stuck "Building…" forever.
          { generationStatus: 'generating', updatedAt: { lt: staleGenerationCutoff() } },
        ],
      },
      data: {
        generationStatus: 'generating',
        generationError: null,
        generationProgress: Prisma.DbNull,
      },
    });
    if (claimed.count === 0) {
      // Lost the claim — no run started here, so return the reserved credit
      // (otherwise a double-click / lost race silently burns a regeneration).
      await refundUsage(userId, 'path_regenerate');
      // Almost always because a run is already in flight, but also if the plan
      // was deleted between the lookup and the claim. Re-check (only on this
      // rare path) so a deleted plan still reports 404, not 400.
      const stillExists = await db.studyPlan.findFirst({
        where: { id: planId, userId },
        select: { id: true },
      });
      return stillExists
        ? badRequestResponse('Generation is already in progress')
        : notFoundResponse('Path not found');
    }

    await invalidateDashboardCache(userId);
    try {
      await enqueueJob('path.regenerate', { planId }, { dedupeKey: `path:generate:${planId}` });
    } catch (error) {
      await refundUsage(userId, 'path_regenerate');
      await db.studyPlan
        .update({
          where: { id: planId },
          data: {
            generationStatus: 'failed',
            generationError: 'Could not start regeneration. Please try again.',
          },
        })
        .catch(() => {});
      throw error;
    }

    return successResponse({ planId, status: 'generating' });
  } catch (error) {
    console.error('[learn/paths regenerate]', error);
    return internalErrorResponse();
  }
}
