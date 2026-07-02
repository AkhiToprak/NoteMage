/**
 * Weakness Training Phase 4.3c (plans/weakness-training-phase4.md §13.3,
 * §13.4, §13.6, §13.8) — the due-card queue backing `GET
 * /api/flashcards/review-queue` and the `/practice/review` page. Kept in its
 * own file (rather than added to `flashcard-review.ts`) so the 4.3b batch-
 * grade module — already finished and out of scope here — stays untouched.
 *
 * Due-card query (plan §13.3): every card across ALL of the user's flashcard
 * sets (`flashcardSet: { userId }`, path AND Study Pack decks — cross-deck is
 * the point), `nextReviewAt` null (never-reviewed) OR `<= now` (overdue).
 * Ordered `nextReviewAt ASC`, which in Postgres sorts NULLs first — never-
 * reviewed cards surface before re-reinforcement of already-seen ones,
 * deliberate per plan §13.3.
 *
 * Session caps (plan §13.4, query-shape limits not quotas): 20 new cards +
 * 100 due-review cards per session; `dueCount`/`newCount` in the response are
 * the TOTAL counts (including cards beyond the cap) so the dashboard tile and
 * the page's own header can never disagree with each other (plan §13.8
 * acceptance: "tile count === page count").
 */

import { db } from '@/lib/db';

export const NEW_CARD_CAP = 20;
export const REVIEW_CARD_CAP = 100;

export interface ReviewQueueImage {
  id: string;
  side: string;
  fileName: string;
  caption: string | null;
}

export interface ReviewQueueCard {
  id: string;
  question: string;
  answer: string;
  images: ReviewQueueImage[];
  setId: string;
  setTitle: string;
}

export interface ReviewQueue {
  cards: ReviewQueueCard[];
  /** Total due (nextReviewAt <= now), INCLUDING cards beyond the session cap. */
  dueCount: number;
  /** Total never-reviewed (nextReviewAt null), INCLUDING cards beyond the cap. */
  newCount: number;
}

/**
 * One query across every card the user owns (via `flashcardSet.userId`) with
 * `nextReviewAt: null` or `<= now`, then an in-memory split into "new"
 * (never-reviewed) vs. "due" (overdue) buckets — cheap because a single
 * learner's due+new set is bounded in practice, and this avoids a second
 * round-trip. The two buckets are capped independently (new first, since
 * `ORDER BY nextReviewAt ASC` already puts them first) then concatenated —
 * new cards ahead of reviews, mirroring the ordering note in §13.3.
 */
export async function loadReviewQueue(userId: string, now: Date = new Date()): Promise<ReviewQueue> {
  const rows = await db.flashcard.findMany({
    where: {
      flashcardSet: { userId },
      OR: [{ nextReviewAt: null }, { nextReviewAt: { lte: now } }],
    },
    orderBy: { nextReviewAt: { sort: 'asc', nulls: 'first' } },
    select: {
      id: true,
      question: true,
      answer: true,
      nextReviewAt: true,
      flashcardSetId: true,
      flashcardSet: { select: { title: true } },
      images: {
        select: { id: true, side: true, fileName: true, caption: true },
        orderBy: { sortOrder: 'asc' },
      },
    },
  });

  const newRows = rows.filter((r) => r.nextReviewAt === null);
  const dueRows = rows.filter((r) => r.nextReviewAt !== null);

  const cappedNew = newRows.slice(0, NEW_CARD_CAP);
  const cappedDue = dueRows.slice(0, REVIEW_CARD_CAP);

  const toCard = (row: (typeof rows)[number]): ReviewQueueCard => ({
    id: row.id,
    question: row.question,
    answer: row.answer,
    images: row.images.map((img) => ({
      id: img.id,
      side: img.side,
      fileName: img.fileName,
      caption: img.caption,
    })),
    setId: row.flashcardSetId,
    setTitle: row.flashcardSet.title,
  });

  return {
    cards: [...cappedNew, ...cappedDue].map(toCard),
    dueCount: dueRows.length,
    newCount: newRows.length,
  };
}

/**
 * Cheap count-only variant for the dashboard tile (plan §13.7/§13.8 — the
 * tile shows "N cards due" without paying for the full queue payload). Counts
 * the SAME where-clause as {@link loadReviewQueue} (both null and overdue,
 * i.e. `dueCount + newCount`) so the tile's number matches what the page
 * would show as its combined due total.
 */
export async function countDueFlashcards(userId: string, now: Date = new Date()): Promise<number> {
  return db.flashcard.count({
    where: {
      flashcardSet: { userId },
      OR: [{ nextReviewAt: null }, { nextReviewAt: { lte: now } }],
    },
  });
}
