import { randomUUID } from 'crypto';
import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { rateLimit, rateLimitKey } from '@/lib/rate-limit';
import { checkAndUnlockAchievements } from '@/lib/achievement-checker';
import { trackFlashcardGrades } from '@/lib/concept-tracking';
import { invalidateDashboardCache } from '@/lib/dashboard-data';
import {
  applyReviewGrades,
  applySeedOnly,
  validateGrades,
  FlashcardReviewValidationError,
  FlashcardReviewNotFoundError,
} from '@/lib/flashcard-review';
import {
  createdResponse,
  badRequestResponse,
  unauthorizedResponse,
  notFoundResponse,
  tooManyRequestsResponse,
  internalErrorResponse,
} from '@/lib/api-response';

// Weakness Training Phase 4.3b (plans/weakness-training-phase4.md §13.6) —
// batch SM-2 grading for the review-slot 4-button UI, plus a minimal
// `seedOnly` mode for the passive "seed to tomorrow" call fired from
// LEARNING-kind checkpoint decks (§13.7). Two request shapes, same route,
// same IDOR guard: both paths resolve exclusively through
// `flashcardSet.userId === userId` (enforced inside flashcard-review.ts).

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    // DB-write throttle (plan §13.5), not a cost control — grading is
    // deterministic and free for both tiers.
    const limit = await rateLimit(rateLimitKey('flashcard-grade', request, userId), 60, 60_000);
    if (!limit.success) {
      return tooManyRequestsResponse('Too many requests. Try again shortly.', limit.retryAfterMs);
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return badRequestResponse('Invalid request body');
    }

    // seedOnly mode: passive nextReviewAt seeding for never-reviewed cards
    // (§13.7). No grading, no concept tracking — just a schedule seed.
    if ((body as { seedOnly?: unknown }).seedOnly === true) {
      const cardIds = (body as { cardIds?: unknown }).cardIds;
      if (!Array.isArray(cardIds) || cardIds.length === 0 || !cardIds.every((c) => typeof c === 'string')) {
        return badRequestResponse('cardIds must be a non-empty array of strings');
      }
      try {
        const { seededCount } = await applySeedOnly(userId, cardIds, new Date());
        return createdResponse({ seededCount });
      } catch (error) {
        if (error instanceof FlashcardReviewNotFoundError) return notFoundResponse('One or more cards were not found');
        if (error instanceof FlashcardReviewValidationError) return badRequestResponse(error.message);
        throw error;
      }
    }

    const { setId, grades: rawGrades } = body as { setId?: unknown; grades?: unknown };
    if (typeof setId !== 'string' || !setId) {
      return badRequestResponse('setId is required');
    }

    let grades;
    try {
      grades = validateGrades(rawGrades);
    } catch (error) {
      if (error instanceof FlashcardReviewValidationError) return badRequestResponse(error.message);
      throw error;
    }

    const now = new Date();
    let results;
    try {
      results = await applyReviewGrades(userId, grades, now);
    } catch (error) {
      if (error instanceof FlashcardReviewNotFoundError) return notFoundResponse('One or more cards were not found');
      if (error instanceof FlashcardReviewValidationError) return badRequestResponse(error.message);
      throw error;
    }

    checkAndUnlockAchievements(userId).catch(console.error);

    // Weakness Training Phase 4.3b — post-commit, best-effort concept
    // tracking. The SM-2 transaction above has already committed; this
    // block must NEVER change the response. Any throw is caught and logged,
    // mirroring the quiz-sets attempts route's discipline.
    const t0 = performance.now();
    try {
      await trackFlashcardGrades({
        userId,
        sourceAttemptId: randomUUID(),
        grades,
        now,
      });
    } catch (error) {
      console.error('[flashcard-review] post-commit concept tracking failed', {
        userId,
        setId,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      await invalidateDashboardCache(userId).catch(() => {});
      console.info('[flashcard-review] review-sessions latency', {
        userId,
        elapsedMs: Math.round(performance.now() - t0),
      });
    }

    return createdResponse({ results });
  } catch (error) {
    console.error('Error creating flashcard review session:', error);
    return internalErrorResponse();
  }
}
