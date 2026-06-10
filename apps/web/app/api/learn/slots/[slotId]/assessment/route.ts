import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  successResponse,
  unauthorizedResponse,
  notFoundResponse,
  internalErrorResponse,
  forbiddenResponse,
  badRequestResponse,
} from '@/lib/api-response';
import { isSlotUnlocked, starsForPercentage } from '@/lib/path-gating';
import { logTelemetry } from '@/lib/telemetry-server';

// Phase 10.6 — record an assessment attempt + roll up the slot.
//
// When the user completes the quiz inside an `assessment` slot the
// drawer POSTs `{ score, total, percentage }` here. The server:
//   • Verifies the slot belongs to a path the user owns and is unlocked.
//   • Stores an AssessmentAttempt row.
//   • Computes starsEarned (3 ≥ 95%, 2 ≥ 85%, 1 ≥ 70%, 0 below) and
//     stores the BEST star count ever earned on this slot.
//   • Marks the quiz activity completed when ≥ 1 star (i.e. ≥ 70%).
// Returns `{ starsEarned, passed, slot }` so the drawer can render the
// post-quiz star animation without another round trip.

type Params = { params: Promise<{ slotId: string }> };

interface AssessmentBody {
  // The id of the server-graded QuizAttempt the learner just created via the
  // notebook quiz-attempts route. We re-derive the grade from that row rather
  // than trust a client-supplied score (which could be forged directly here).
  attemptId: string;
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { slotId } = await params;
    const body = (await request.json().catch(() => ({}))) as AssessmentBody;
    if (typeof body.attemptId !== 'string' || body.attemptId.length === 0) {
      return badRequestResponse('attemptId is required');
    }

    const slot = await db.checkpointSlot.findUnique({
      where: { id: slotId },
      include: {
        activities: { orderBy: { sortOrder: 'asc' } },
        phase: {
          include: {
            plan: {
              include: {
                phases: {
                  orderBy: { sortOrder: 'asc' },
                  include: {
                    slots: {
                      orderBy: { sortOrder: 'asc' },
                      include: { activities: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!slot) return notFoundResponse('Slot not found');
    if (slot.phase.plan.userId !== userId) return notFoundResponse('Slot not found');
    if (slot.kind !== 'assessment' && slot.kind !== 'final_exam') {
      return badRequestResponse('Slot is not a graded slot');
    }

    const gate = isSlotUnlocked(slot.phase.plan.phases, slotId);
    if (!gate.unlocked) {
      return forbiddenResponse(`Slot is locked (${gate.reason ?? 'unknown'})`);
    }

    const quizActivity = slot.activities.find((a) => a.kind === 'quiz');
    if (!quizActivity?.quizSetId) {
      return badRequestResponse('Slot has no gradable quiz');
    }

    // Trust ONLY a server-graded attempt that (a) the caller owns and (b) is for
    // THIS slot's quiz set. The notebook quiz-attempts route re-grades every
    // answer server-side (including re-running code_write via Piston), so its
    // stored score/percentage are authoritative — unlike a client number.
    const attempt = await db.quizAttempt.findUnique({
      where: { id: body.attemptId },
      select: { userId: true, quizSetId: true, score: true, total: true, percentage: true },
    });
    if (!attempt || attempt.userId !== userId || attempt.quizSetId !== quizActivity.quizSetId) {
      return badRequestResponse('Attempt does not match this checkpoint');
    }

    const score = attempt.score;
    const total = attempt.total;
    const percentage = attempt.percentage;
    const stars = starsForPercentage(percentage);

    await db.$transaction(async (tx) => {
      await tx.assessmentAttempt.create({
        data: {
          slotId,
          userId,
          score,
          total,
          percentage,
          starsEarned: stars,
        },
      });
      // Star count on the slot is the BEST of all attempts. We only
      // need to bump it forward, never down. Same goes for bestPercentage
      // — drives the letter-grade chip; max-merge with prior value.
      const slotUpdate: { starsEarned?: number; bestPercentage?: number } = {};
      if (stars > slot.starsEarned) slotUpdate.starsEarned = stars;
      const priorBest = slot.bestPercentage ?? 0;
      if (percentage > priorBest) slotUpdate.bestPercentage = percentage;
      if (Object.keys(slotUpdate).length > 0) {
        await tx.checkpointSlot.update({
          where: { id: slotId },
          data: slotUpdate,
        });
      }
      // Pass (≥ 1 star) marks the quiz activity completed. Fails leave
      // the activity un-completed so the slot stays active.
      if (stars >= 1 && quizActivity && !quizActivity.completed) {
        await tx.checkpointActivity.update({
          where: { id: quizActivity.id },
          data: { completed: true, completedAt: new Date() },
        });
      }
    });

    const updatedSlot = await db.checkpointSlot.findUnique({
      where: { id: slotId },
      include: { activities: { orderBy: { sortOrder: 'asc' } } },
    });

    logTelemetry(userId, 'path.assessment.completed', {
      planId: slot.phase.plan.id,
      slotId,
      score,
      total,
      percentage,
      starsEarned: stars,
      passed: stars >= 1,
    });

    return successResponse({
      starsEarned: stars,
      percentage,
      passed: stars >= 1,
      slot: updatedSlot,
    });
  } catch (error) {
    console.error('[learn/slots/assessment POST]', error);
    return internalErrorResponse();
  }
}
