import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  successResponse,
  unauthorizedResponse,
  notFoundResponse,
  internalErrorResponse,
  badRequestResponse,
} from '@/lib/api-response';
import { staleGenerationCutoff } from '@/lib/path-loader';
import { invalidateDashboardCache } from '@/lib/dashboard-data';

// Reset a learner's progress on a path WITHOUT touching the generated
// content. Clears completion, stars, best scores, assessment attempts, and
// flashcard spaced-repetition state so the whole path can be redone from
// scratch. No AI — a single transaction over the progress-bearing rows.

type Params = { params: Promise<{ planId: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { planId } = await params;
    const plan = await db.studyPlan.findFirst({
      where: { id: planId, userId },
      select: {
        id: true,
        generationStatus: true,
        updatedAt: true,
        phases: {
          select: {
            slots: {
              select: {
                id: true,
                activities: { select: { id: true, flashcardSetId: true } },
              },
            },
          },
        },
      },
    });
    if (!plan) return notFoundResponse('Path not found');

    // Refuse only while a LIVE orchestrator is mid-run — resetting then would
    // race the background writer. A row wedged in `generating` past the liveness
    // window means that writer died (e.g. a redeploy killed it), so it's safe to
    // reset and recover an otherwise-bricked path.
    if (plan.generationStatus === 'generating' && plan.updatedAt >= staleGenerationCutoff()) {
      return badRequestResponse('Wait for the path to finish before resetting');
    }

    const slotIds: string[] = [];
    const activityIds: string[] = [];
    const flashcardSetIds: string[] = [];
    for (const phase of plan.phases) {
      for (const slot of phase.slots) {
        slotIds.push(slot.id);
        for (const activity of slot.activities) {
          activityIds.push(activity.id);
          if (activity.flashcardSetId) flashcardSetIds.push(activity.flashcardSetId);
        }
      }
    }

    if (slotIds.length === 0) {
      return successResponse({ reset: true });
    }

    await db.$transaction([
      db.checkpointActivity.updateMany({
        where: { id: { in: activityIds } },
        data: { completed: false, completedAt: null },
      }),
      db.checkpointSlot.updateMany({
        where: { id: { in: slotIds } },
        data: { starsEarned: 0, bestPercentage: null },
      }),
      db.assessmentAttempt.deleteMany({ where: { slotId: { in: slotIds } } }),
      db.flashcard.updateMany({
        where: { flashcardSetId: { in: flashcardSetIds } },
        data: {
          easeFactor: 2.5,
          interval: 0,
          repetitions: 0,
          nextReviewAt: null,
          lastReviewAt: null,
        },
      }),
    ]);
    await invalidateDashboardCache(userId);

    return successResponse({ reset: true });
  } catch (error) {
    console.error('[learn/paths/[planId] reset]', error);
    return internalErrorResponse();
  }
}
