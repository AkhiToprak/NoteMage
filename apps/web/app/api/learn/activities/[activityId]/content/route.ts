import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  successResponse,
  unauthorizedResponse,
  notFoundResponse,
  internalErrorResponse,
} from '@/lib/api-response';

// Phase 10.6 — fetch the content body for one CheckpointActivity.
//
// The drawer calls this when the user opens an activity. The response
// is shape-discriminated by `kind`:
//
//   { kind: 'theory',     theory: { id, title, body } }
//   { kind: 'flashcards', flashcardSet: { id, notebookId, title, cards: [...] } }
//   { kind: 'quiz',       quizSet:      { id, notebookId, title, questions: [...] } }
//
// Authorization piggybacks on the activity's slot → phase → plan path:
// only the plan owner sees the body.

type Params = { params: Promise<{ activityId: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { activityId } = await params;

    const activity = await db.checkpointActivity.findUnique({
      where: { id: activityId },
      include: {
        slot: {
          include: {
            phase: { include: { plan: { select: { userId: true, notebookId: true } } } },
          },
        },
        theory: true,
        flashcardSet: {
          include: { flashcards: { orderBy: { sortOrder: 'asc' } } },
        },
        quizSet: {
          include: { questions: { orderBy: { sortOrder: 'asc' } } },
        },
      },
    });
    if (!activity) return notFoundResponse('Activity not found');
    if (activity.slot.phase.plan.userId !== userId) {
      return notFoundResponse('Activity not found');
    }

    // Self-heal for pre-fix data: path-generated FlashcardSet / QuizSet
    // rows could be created with notebookId=null when the parent plan
    // was created without a primaryNotebookId. The viewers can't run
    // without one, so resolve a fallback (parent plan → user's oldest
    // notebook) and persist it the first time the activity is opened.
    const resolveFallbackNotebookId = async (): Promise<string | null> => {
      if (activity.slot.phase.plan.notebookId) {
        return activity.slot.phase.plan.notebookId;
      }
      const owned = await db.notebook.findFirst({
        where: { userId },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      return owned?.id ?? null;
    };

    if (activity.kind === 'theory' && activity.theory) {
      return successResponse({
        kind: 'theory' as const,
        theory: {
          id: activity.theory.id,
          title: activity.theory.title,
          body: activity.theory.body,
        },
      });
    }
    if (activity.kind === 'flashcards' && activity.flashcardSet) {
      let notebookId = activity.flashcardSet.notebookId;
      if (!notebookId) {
        const fallback = await resolveFallbackNotebookId();
        if (fallback) {
          await db.flashcardSet.update({
            where: { id: activity.flashcardSet.id },
            data: { notebookId: fallback },
          });
          if (!activity.slot.phase.plan.notebookId) {
            await db.studyPlan.update({
              where: { id: activity.slot.phase.planId },
              data: { notebookId: fallback },
            });
          }
          notebookId = fallback;
        }
      }
      return successResponse({
        kind: 'flashcards' as const,
        flashcardSet: {
          id: activity.flashcardSet.id,
          notebookId,
          title: activity.flashcardSet.title,
          cards: activity.flashcardSet.flashcards,
        },
      });
    }
    if (activity.kind === 'quiz' && activity.quizSet) {
      let notebookId = activity.quizSet.notebookId;
      if (!notebookId) {
        const fallback = await resolveFallbackNotebookId();
        if (fallback) {
          await db.quizSet.update({
            where: { id: activity.quizSet.id },
            data: { notebookId: fallback },
          });
          if (!activity.slot.phase.plan.notebookId) {
            await db.studyPlan.update({
              where: { id: activity.slot.phase.planId },
              data: { notebookId: fallback },
            });
          }
          notebookId = fallback;
        }
      }
      return successResponse({
        kind: 'quiz' as const,
        quizSet: {
          id: activity.quizSet.id,
          notebookId,
          title: activity.quizSet.title,
          questions: activity.quizSet.questions,
        },
      });
    }

    // Activity row exists but its content FK is null — shouldn't happen
    // after a successful generation, but guard against partial states.
    return notFoundResponse('Activity content not available');
  } catch (error) {
    console.error('[learn/activities/content GET]', error);
    return internalErrorResponse();
  }
}
