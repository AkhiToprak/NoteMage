import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { flashcardReviewQueueEnabled } from '@/lib/feature-flags';
import { loadReviewQueue } from '@/lib/flashcard-review-queue';
import { successResponse, unauthorizedResponse, notFoundResponse, internalErrorResponse } from '@/lib/api-response';

/**
 * GET /api/flashcards/review-queue — Weakness Training Phase 4.3c (plans/
 * weakness-training-phase4.md §13.6, §13.8). Assembles the due-card queue
 * across ALL of the caller's flashcard sets (path + Study Pack — cross-deck
 * is the point), capped per §13.4, and returns `{ cards, dueCount, newCount }`.
 *
 * Flag-gated the same way as `/profile/weak-spots` — 404 (not an empty
 * queue) when `FLASHCARD_REVIEW_QUEUE` is off, so a disabled surface never
 * half-renders.
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    if (!flashcardReviewQueueEnabled()) {
      return notFoundResponse('The review queue is unavailable.');
    }

    const queue = await loadReviewQueue(userId, new Date());
    return successResponse(queue);
  } catch (error) {
    console.error('Error loading flashcard review queue:', error);
    return internalErrorResponse();
  }
}
