import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { resolvePathHostNotebookId } from '@/lib/inbox';
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
          include: {
            flashcards: {
              orderBy: { sortOrder: 'asc' },
              // Figure-reuse (P3): carry each card's embedded figures so the
              // checkpoint viewer can render them. Empty for unfigured sets.
              include: { images: { orderBy: { sortOrder: 'asc' } } },
            },
          },
        },
        quizSet: {
          include: {
            questions: {
              orderBy: { sortOrder: 'asc' },
              // Figure-reuse (P4): carry each question's exhibit image (0-or-1)
              // so the quiz player can render it above the prompt. `image` is
              // null for unfigured questions.
              include: { image: true },
            },
          },
        },
      },
    });
    if (!activity) return notFoundResponse('Activity not found');
    if (activity.slot.phase.plan.userId !== userId) {
      return notFoundResponse('Activity not found');
    }

    // Self-heal for content with a null host notebook. Two sources:
    //   1. Cloned community paths — the clone route copies FlashcardSet /
    //      QuizSet rows WITHOUT a notebookId (only the generator stamps it).
    //   2. Pre-fix first-party data — sets created before the generator
    //      always resolved a primary notebook.
    // The viewers URL-template `notebookId` into every fetch and can't run
    // without one, so resolve a host (parent plan → user's oldest notebook →
    // hidden Inbox) and persist it the first time the activity is opened.
    // `resolvePathHostNotebookId` never returns null, so a paths-first learner
    // who cloned a path WITHOUT ever creating a notebook is no longer stuck on
    // "This quiz isn't linked to a notebook yet."
    const resolveFallbackNotebookId = async (): Promise<string> => {
      if (activity.slot.phase.plan.notebookId) {
        return activity.slot.phase.plan.notebookId;
      }
      return resolvePathHostNotebookId(userId);
    };

    if (activity.kind === 'theory' && activity.theory) {
      return successResponse({
        kind: 'theory' as const,
        theory: {
          id: activity.theory.id,
          title: activity.theory.title,
          body: activity.theory.body,
          // Source-highlighting — the lesson's primary grounding anchor so the
          // theory viewer can open the origin material instead of opening Mage.
          sourceLabel: activity.theory.sourceLabel,
          sourcePage: activity.theory.sourcePage,
          sourceQuote: activity.theory.sourceQuote,
          sourceMaterialId: activity.theory.sourceMaterialId,
          sourceMaterialKind: activity.theory.sourceMaterialKind,
          sourceTimestampSec: activity.theory.sourceTimestampSec,
        },
      });
    }
    if (activity.kind === 'flashcards' && activity.flashcardSet) {
      let notebookId = activity.flashcardSet.notebookId;
      if (!notebookId) {
        const fallback = await resolveFallbackNotebookId();
        // Stamp `sourcePathId` together with `notebookId`. Linking the bundle
        // to a real notebook WITHOUT it would leak this cloned set into that
        // notebook's flashcard list, which filters `sourcePathId: null`. The
        // set belongs to exactly one activity → slot → phase → plan, so this
        // plan id is the correct source path.
        await db.flashcardSet.update({
          where: { id: activity.flashcardSet.id },
          data: { notebookId: fallback, sourcePathId: activity.slot.phase.planId },
        });
        if (!activity.slot.phase.plan.notebookId) {
          await db.studyPlan.update({
            where: { id: activity.slot.phase.planId },
            data: { notebookId: fallback },
          });
        }
        notebookId = fallback;
      }
      return successResponse({
        kind: 'flashcards' as const,
        flashcardSet: {
          id: activity.flashcardSet.id,
          notebookId,
          title: activity.flashcardSet.title,
          cards: activity.flashcardSet.flashcards,
          // Path-diagrams revival (Phase 3): set-level reference diagrams copied
          // from the covering theory. Pass-through JSON — the client validates
          // each entry with PathDiagramSchema before rendering.
          diagrams: activity.flashcardSet.diagrams ?? null,
        },
      });
    }
    if (activity.kind === 'quiz' && activity.quizSet) {
      let notebookId = activity.quizSet.notebookId;
      if (!notebookId) {
        const fallback = await resolveFallbackNotebookId();
        // See the flashcard branch — stamp `sourcePathId` with the notebook so
        // the cloned quiz never leaks into the host notebook's quiz list.
        await db.quizSet.update({
          where: { id: activity.quizSet.id },
          data: { notebookId: fallback, sourcePathId: activity.slot.phase.planId },
        });
        if (!activity.slot.phase.plan.notebookId) {
          await db.studyPlan.update({
            where: { id: activity.slot.phase.planId },
            data: { notebookId: fallback },
          });
        }
        notebookId = fallback;
      }
      return successResponse({
        kind: 'quiz' as const,
        quizSet: {
          id: activity.quizSet.id,
          notebookId,
          title: activity.quizSet.title,
          questions: activity.quizSet.questions,
          // Path-diagrams revival (Phase 3): set-level reference diagrams copied
          // from the covered theory. Pass-through JSON — the client validates.
          diagrams: activity.quizSet.diagrams ?? null,
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
