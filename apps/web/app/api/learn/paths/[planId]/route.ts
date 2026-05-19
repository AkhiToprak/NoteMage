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
import { loadPathForUser, serializePath } from '@/lib/path-loader';

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
      select: {
        id: true,
        generationStatus: true,
        phases: {
          select: {
            slots: {
              select: {
                activities: {
                  select: { theoryId: true, flashcardSetId: true, quizSetId: true },
                },
              },
            },
          },
        },
      },
    });
    if (!plan) return notFoundResponse('Path not found');

    // Refuse mid-generation — a delete now would orphan content the
    // background orchestrator writes after this point.
    if (plan.generationStatus === 'generating') {
      return badRequestResponse('Wait for generation to finish before deleting');
    }

    const theoryIds: string[] = [];
    const quizSetIds: string[] = [];
    const flashcardSetIds: string[] = [];
    for (const phase of plan.phases) {
      for (const slot of phase.slots) {
        for (const activity of slot.activities) {
          if (activity.theoryId) theoryIds.push(activity.theoryId);
          if (activity.quizSetId) quizSetIds.push(activity.quizSetId);
          if (activity.flashcardSetId) flashcardSetIds.push(activity.flashcardSetId);
        }
      }
    }

    await db.$transaction([
      db.studyPlan.delete({ where: { id: planId } }),
      db.theoryContent.deleteMany({ where: { id: { in: theoryIds } } }),
      db.quizSet.deleteMany({ where: { id: { in: quizSetIds } } }),
      db.flashcardSet.deleteMany({ where: { id: { in: flashcardSetIds } } }),
    ]);

    return successResponse({ deleted: true });
  } catch (error) {
    console.error('[learn/paths/[planId] DELETE]', error);
    return internalErrorResponse();
  }
}
