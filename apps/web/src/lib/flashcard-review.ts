/**
 * Weakness Training Phase 4.3b (plans/weakness-training-phase4.md §13.6) —
 * pure(ish) helpers behind `POST /api/flashcards/review-sessions`. Kept out
 * of the route file per project convention (route files export only HTTP
 * handlers), and unit-tested directly against a mocked `db`.
 *
 * Two entry points, both IDOR-guarded the same way (every card must belong
 * to the caller via `flashcardSet.userId`):
 *  - `applyReviewGrades`: the 4-button batch grade — runs `sm2Lite()` per
 *    card inside one transaction (all-or-nothing) and returns per-card
 *    results for the response envelope.
 *  - `applySeedOnly`: the passive "seed to tomorrow" call fired from
 *    `handleDone()` on a LEARNING-kind checkpoint deck (plan §13.7) — only
 *    ever touches cards with `nextReviewAt: null` (never-reviewed), so it
 *    can never clobber a real SM-2 schedule.
 */

import { db } from '@/lib/db';
import { sm2Lite, type SM2LiteResult } from '@/lib/spaced-repetition';

export const MAX_GRADES_PER_BATCH = 120;
export const VALID_QUALITIES = [0, 3, 4, 5] as const;
export type ReviewQuality = (typeof VALID_QUALITIES)[number];

export interface ReviewGradeInput {
  cardId: string;
  quality: ReviewQuality;
}

export interface ReviewGradeResult {
  cardId: string;
  interval: number;
  nextReviewAt: string;
  isLeech: boolean;
}

export class FlashcardReviewValidationError extends Error {}
export class FlashcardReviewNotFoundError extends Error {}

/**
 * Validate the raw request body shape before any DB access. Kept separate
 * from the DB-touching functions so the route can return 400 without a
 * round-trip.
 */
export function validateGrades(grades: unknown): ReviewGradeInput[] {
  if (!Array.isArray(grades) || grades.length === 0) {
    throw new FlashcardReviewValidationError('grades must be a non-empty array');
  }
  if (grades.length > MAX_GRADES_PER_BATCH) {
    throw new FlashcardReviewValidationError(
      `grades exceeds the ${MAX_GRADES_PER_BATCH}-card batch cap`
    );
  }
  const seen = new Set<string>();
  const parsed: ReviewGradeInput[] = [];
  for (const raw of grades) {
    if (
      !raw ||
      typeof raw !== 'object' ||
      typeof (raw as { cardId?: unknown }).cardId !== 'string' ||
      !(raw as { cardId: string }).cardId
    ) {
      throw new FlashcardReviewValidationError('each grade needs a string cardId');
    }
    const cardId = (raw as { cardId: string }).cardId;
    const quality = (raw as { quality?: unknown }).quality;
    if (!VALID_QUALITIES.includes(quality as ReviewQuality)) {
      throw new FlashcardReviewValidationError(`invalid quality for card ${cardId}`);
    }
    if (seen.has(cardId)) {
      throw new FlashcardReviewValidationError(`duplicate cardId ${cardId}`);
    }
    seen.add(cardId);
    parsed.push({ cardId, quality: quality as ReviewQuality });
  }
  return parsed;
}

/**
 * IDOR guard shared by both grade + seed paths: load the requested cards
 * scoped to `flashcardSet.userId === userId`. Throws
 * `FlashcardReviewNotFoundError` if any requested card is missing or
 * belongs to another user's set — callers translate that into 404, never
 * revealing which cards exist vs. belong to someone else.
 */
async function loadOwnedCards(userId: string, cardIds: string[]) {
  const cards = await db.flashcard.findMany({
    where: {
      id: { in: cardIds },
      flashcardSet: { userId },
    },
    select: {
      id: true,
      easeFactor: true,
      interval: true,
      repetitions: true,
      lapses: true,
      nextReviewAt: true,
    },
  });
  if (cards.length !== cardIds.length) {
    throw new FlashcardReviewNotFoundError('one or more cards were not found');
  }
  return cards;
}

/**
 * Apply a batch of 4-button grades: per card, `sm2Lite()` against its
 * current SM-2 columns, then update all 6 columns in one `$transaction`
 * (all-or-nothing — a mid-batch failure rolls back every card, never a
 * partially-graded deck). Returns per-card results for the route's 201
 * envelope. Does NOT touch `ConceptAttemptEvent` — that's the caller's
 * post-commit, best-effort `trackFlashcardGrades()` call.
 */
export async function applyReviewGrades(
  userId: string,
  grades: ReviewGradeInput[],
  now: Date = new Date()
): Promise<ReviewGradeResult[]> {
  const cardIds = grades.map((g) => g.cardId);
  const cardsById = new Map((await loadOwnedCards(userId, cardIds)).map((c) => [c.id, c]));

  const updates: { cardId: string; result: SM2LiteResult }[] = grades.map((grade) => {
    const card = cardsById.get(grade.cardId);
    if (!card) {
      // Unreachable given loadOwnedCards' length check, but keeps this
      // function safe to call standalone / in future refactors.
      throw new FlashcardReviewNotFoundError(`card ${grade.cardId} not found`);
    }
    const result = sm2Lite(
      grade.quality,
      card.easeFactor,
      card.interval,
      card.repetitions,
      card.lapses
    );
    return { cardId: grade.cardId, result };
  });

  await db.$transaction(
    updates.map(({ cardId, result }) =>
      db.flashcard.update({
        where: { id: cardId },
        data: {
          easeFactor: result.easeFactor,
          interval: result.interval,
          repetitions: result.repetitions,
          nextReviewAt: result.nextReviewAt,
          lastReviewAt: now,
          lapses: result.lapses,
        },
      })
    )
  );

  return updates.map(({ cardId, result }) => ({
    cardId,
    interval: result.interval,
    nextReviewAt: result.nextReviewAt.toISOString(),
    isLeech: result.isLeech,
  }));
}

export const MAX_SEED_CARDS_PER_BATCH = 200;

/**
 * Passive seeding (plan §13.7): on `handleDone()` of a LEARNING-kind
 * checkpoint deck, never-reviewed cards (`nextReviewAt: null`) get
 * `nextReviewAt` set to tomorrow so they enter the review queue without a
 * premature self-grade. Deliberately narrow — the `WHERE nextReviewAt:
 * null` clause means this can only ever seed fresh cards, never overwrite
 * an existing SM-2 schedule, so it's safe to fire-and-forget with no grade
 * data at all.
 */
export async function applySeedOnly(
  userId: string,
  cardIds: string[],
  now: Date = new Date()
): Promise<{ seededCount: number }> {
  if (cardIds.length === 0) return { seededCount: 0 };
  if (cardIds.length > MAX_SEED_CARDS_PER_BATCH) {
    throw new FlashcardReviewValidationError(
      `cardIds exceeds the ${MAX_SEED_CARDS_PER_BATCH}-card seed cap`
    );
  }

  const owned = await db.flashcard.findMany({
    where: { id: { in: cardIds }, flashcardSet: { userId } },
    select: { id: true },
  });
  if (owned.length !== cardIds.length) {
    throw new FlashcardReviewNotFoundError('one or more cards were not found');
  }

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);

  const result = await db.flashcard.updateMany({
    where: { id: { in: cardIds }, flashcardSet: { userId }, nextReviewAt: null },
    data: { nextReviewAt: tomorrow },
  });

  return { seededCount: result.count };
}
