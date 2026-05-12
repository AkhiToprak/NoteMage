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
  score: number;
  total: number;
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { slotId } = await params;
    const body = (await request.json().catch(() => ({}))) as AssessmentBody;
    if (
      typeof body.score !== 'number' ||
      typeof body.total !== 'number' ||
      body.total <= 0 ||
      body.score < 0 ||
      body.score > body.total
    ) {
      return badRequestResponse('score and total are required and must be valid');
    }
    const percentage = Math.round((body.score / body.total) * 100 * 100) / 100;
    const stars = starsForPercentage(percentage);

    const slot = await db.checkpointSlot.findUnique({
      where: { id: slotId },
      include: {
        activities: { orderBy: { sortOrder: 'asc' } },
        phase: {
          include: {
            plan: {
              select: { id: true, userId: true },
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
    if (slot.kind !== 'assessment') {
      return badRequestResponse('Slot is not an assessment slot');
    }

    const gate = isSlotUnlocked(slot.phase.plan.phases, slotId);
    if (!gate.unlocked) {
      return forbiddenResponse(`Slot is locked (${gate.reason ?? 'unknown'})`);
    }

    const quizActivity = slot.activities.find((a) => a.kind === 'quiz');

    await db.$transaction(async (tx) => {
      await tx.assessmentAttempt.create({
        data: {
          slotId,
          userId,
          score: body.score,
          total: body.total,
          percentage,
          starsEarned: stars,
        },
      });
      // Star count on the slot is the BEST of all attempts. We only
      // need to bump it forward, never down.
      if (stars > slot.starsEarned) {
        await tx.checkpointSlot.update({
          where: { id: slotId },
          data: { starsEarned: stars },
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
      score: body.score,
      total: body.total,
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
