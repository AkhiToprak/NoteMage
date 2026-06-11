import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  successResponse,
  unauthorizedResponse,
  notFoundResponse,
  internalErrorResponse,
} from '@/lib/api-response';
import {
  loadPathForUser,
  serializePath,
  staleGenerationCutoff,
  deletePathCascade,
  CANCELLING_STATUS,
} from '@/lib/path-loader';
import { refundUsage } from '@/lib/usage-limits';
import { rateLimit, rateLimitKey } from '@/lib/rate-limit';

// Per-user daily cap on auto-refunded ULTRA cancellations. Cancelling always
// stops the generation (we always want to halt COGS), but only the first N
// voluntary cancels per rolling 24h return the credit — past that the user is
// pointed at support. This throttles `create → cancel → refund` credit-farming
// to a human-reviewable rate without ever bricking the stop button.
const ULTRA_CANCEL_REFUNDS_PER_DAY = 3;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

type RefundOutcome = { creditRefunded: boolean; refundLimited: boolean };
const NO_REFUND: RefundOutcome = { creditRefunded: false, refundLimited: false };

// Phase 10.3 — single-plan GET. Returns the full annotated tree
// (phases → slots → activities + unlock / completion flags). The same
// shape the SSE `done` event emits, so the client can hydrate the
// detail view from either path without a second round-trip.

type Params = { params: Promise<{ planId: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { planId } = await params;
    const plan = await loadPathForUser(userId, planId);
    if (!plan) return notFoundResponse('Path not found');

    return successResponse(serializePath(plan));
  } catch (error) {
    console.error('[learn/paths/[planId] GET]', error);
    return internalErrorResponse();
  }
}

// DELETE — remove a path and ALL the content it generated (theory,
// flashcards, quizzes). Deleting the StudyPlan cascades phases → slots →
// activities, but the activity → content FK points the other way, so the
// generated TheoryContent / QuizSet / FlashcardSet rows are deleted
// explicitly. Their child rows (questions, cards, attempts) cascade.
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { planId } = await params;
    const plan = await db.studyPlan.findFirst({
      where: { id: planId, userId },
      select: { id: true, generationStatus: true, updatedAt: true, ultra: true },
    });
    if (!plan) return notFoundResponse('Path not found');

    const cutoff = staleGenerationCutoff();

    // Refund the ULTRA credit for a path that never delivered, capped per day so
    // it can't be farmed. Non-ultra paths have no credit to return.
    const refundDailyCapped = async (): Promise<RefundOutcome> => {
      if (!plan.ultra) return NO_REFUND;
      const daily = await rateLimit(
        rateLimitKey('ultra-cancel', request, userId),
        ULTRA_CANCEL_REFUNDS_PER_DAY,
        ONE_DAY_MS,
      );
      if (!daily.success) return { creditRefunded: false, refundLimited: true };
      await refundUsage(userId, 'ultra_path');
      return { creditRefunded: true, refundLimited: false };
    };
    // A dead-orchestrator (stale) path is our fault, not a voluntary cancel — make
    // the user whole WITHOUT spending one of their daily refunds.
    const refundFree = async (): Promise<RefundOutcome> => {
      if (!plan.ultra) return NO_REFUND;
      await refundUsage(userId, 'ultra_path');
      return { creditRefunded: true, refundLimited: false };
    };

    // A LIVE orchestrator is mid-run. Don't hard-delete — that would orphan the
    // content the writer creates next AND leave it burning tokens on a path the
    // user is discarding. Instead cooperatively cancel: flip the row to
    // `cancelling`. The orchestrator polls this between checkpoints, stops, and
    // self-deletes the half-built path (no orphans — it owns every write).
    if (plan.generationStatus === 'generating' && plan.updatedAt >= cutoff) {
      // Atomic single-winner claim: only the request that actually flips
      // `generating` → `cancelling` refunds, so concurrent DELETEs (double-click,
      // scripted spam) can't double-refund the credit.
      const claim = await db.studyPlan.updateMany({
        where: { id: planId, userId, generationStatus: 'generating' },
        data: { generationStatus: CANCELLING_STATUS },
      });
      if (claim.count === 1) {
        return successResponse({ cancelling: true, ...(await refundDailyCapped()) });
      }
      // Lost the claim — re-read to answer truthfully, but DON'T refund (the
      // winner owns it).
      const current = await db.studyPlan.findFirst({
        where: { id: planId, userId },
        select: { generationStatus: true },
      });
      if (!current) return successResponse({ deleted: true });
      if (current.generationStatus === CANCELLING_STATUS) {
        return successResponse({ cancelling: true });
      }
      // Settled to ready/failed in the race — it delivered, so honor the cancel
      // by deleting but issue NO refund.
      await deletePathCascade(planId);
      return successResponse({ deleted: true });
    }

    // A fresh `cancelling` row already has its orchestrator winding down — don't
    // race it with a hard delete; it removes itself, and the credit was already
    // refunded when it was first stopped. (A STALE `cancelling` row means the
    // writer died mid-cancel, so it falls through and is deletable.)
    if (plan.generationStatus === CANCELLING_STATUS && plan.updatedAt >= cutoff) {
      return successResponse({ cancelling: true });
    }

    // Terminal delete. Refund only when removing a path that never delivered, and
    // again gate it on a single-winner status claim so racing DELETEs refund once:
    //  · stale `generating` → dead orchestrator (our fault) → free refund
    //  · `queued` → never started, voluntary → daily-capped refund
    //  · stale `cancelling` → already refunded at flip → none
    //  · `ready` (delivered) / `failed` (already refunded if empty) → none
    let refund: RefundOutcome = NO_REFUND;
    if (plan.generationStatus === 'generating' || plan.generationStatus === 'queued') {
      const claim = await db.studyPlan.updateMany({
        where: { id: planId, userId, generationStatus: plan.generationStatus },
        data: { generationStatus: CANCELLING_STATUS },
      });
      if (claim.count === 1) {
        // `generating` here is always stale (branch 1 caught the fresh case).
        refund =
          plan.generationStatus === 'generating' ? await refundFree() : await refundDailyCapped();
      }
    }
    await deletePathCascade(planId);
    return successResponse({ deleted: true, ...refund });
  } catch (error) {
    console.error('[learn/paths/[planId] DELETE]', error);
    return internalErrorResponse();
  }
}
