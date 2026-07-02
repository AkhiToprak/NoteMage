import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── mocks ──────────────────────────────────────────────────────────────
//
// `flashcard-review-queue.ts` talks only to `@/lib/db` (`flashcard.findMany`
// and `flashcard.count`). Mocked so `loadReviewQueue`/`countDueFlashcards`
// can be exercised as pure units against fixture rows, mirroring
// `flashcard-review.test.ts`'s mocking style.

const mocks = vi.hoisted(() => ({
  flashcardFindMany: vi.fn(),
  flashcardCount: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    flashcard: {
      findMany: mocks.flashcardFindMany,
      count: mocks.flashcardCount,
    },
  },
}));

import { loadReviewQueue, countDueFlashcards, NEW_CARD_CAP, REVIEW_CARD_CAP } from './flashcard-review-queue';

const NOW = new Date('2026-07-01T12:00:00.000Z');

function row(overrides: Partial<{
  id: string;
  question: string;
  answer: string;
  nextReviewAt: Date | null;
  flashcardSetId: string;
  setTitle: string;
  images: { id: string; side: string; fileName: string; caption: string | null }[];
}> = {}) {
  const { setTitle, ...rest } = overrides;
  return {
    id: 'card-1',
    question: 'Q?',
    answer: 'A.',
    nextReviewAt: null,
    flashcardSetId: 'set-1',
    flashcardSet: { title: setTitle ?? 'Set One' },
    images: [],
    ...rest,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('loadReviewQueue', () => {
  it('queries with the OR(null, <= now) where-clause across all the user\'s sets', async () => {
    mocks.flashcardFindMany.mockResolvedValue([]);
    await loadReviewQueue('user-1', NOW);
    expect(mocks.flashcardFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          flashcardSet: { userId: 'user-1' },
          OR: [{ nextReviewAt: null }, { nextReviewAt: { lte: NOW } }],
        },
      })
    );
  });

  it('orders by nextReviewAt ascending with nulls first', async () => {
    mocks.flashcardFindMany.mockResolvedValue([]);
    await loadReviewQueue('user-1', NOW);
    expect(mocks.flashcardFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { nextReviewAt: { sort: 'asc', nulls: 'first' } },
      })
    );
  });

  it('splits never-reviewed (new) from overdue (due) cards and reports both counts', async () => {
    const rows = [
      row({ id: 'new-1', nextReviewAt: null }),
      row({ id: 'new-2', nextReviewAt: null }),
      row({ id: 'due-1', nextReviewAt: new Date('2026-06-30T00:00:00Z') }),
    ];
    mocks.flashcardFindMany.mockResolvedValue(rows);

    const result = await loadReviewQueue('user-1', NOW);
    expect(result.newCount).toBe(2);
    expect(result.dueCount).toBe(1);
    expect(result.cards).toHaveLength(3);
  });

  it('surfaces never-reviewed cards before overdue ones in the returned card list', async () => {
    const rows = [
      row({ id: 'due-1', nextReviewAt: new Date('2026-06-30T00:00:00Z') }),
      row({ id: 'new-1', nextReviewAt: null }),
    ];
    mocks.flashcardFindMany.mockResolvedValue(rows);

    const result = await loadReviewQueue('user-1', NOW);
    expect(result.cards.map((c) => c.id)).toEqual(['new-1', 'due-1']);
  });

  it(`caps new cards at ${NEW_CARD_CAP} but reports the full newCount beyond the cap`, async () => {
    const rows = Array.from({ length: NEW_CARD_CAP + 5 }, (_, i) => row({ id: `new-${i}`, nextReviewAt: null }));
    mocks.flashcardFindMany.mockResolvedValue(rows);

    const result = await loadReviewQueue('user-1', NOW);
    const newCardsReturned = result.cards.filter((c) => rows.some((r) => r.id === c.id));
    expect(newCardsReturned).toHaveLength(NEW_CARD_CAP);
    expect(result.newCount).toBe(NEW_CARD_CAP + 5);
  });

  it(`caps due cards at ${REVIEW_CARD_CAP} but reports the full dueCount beyond the cap`, async () => {
    const rows = Array.from({ length: REVIEW_CARD_CAP + 10 }, (_, i) =>
      row({ id: `due-${i}`, nextReviewAt: new Date('2026-06-30T00:00:00Z') })
    );
    mocks.flashcardFindMany.mockResolvedValue(rows);

    const result = await loadReviewQueue('user-1', NOW);
    expect(result.cards).toHaveLength(REVIEW_CARD_CAP);
    expect(result.dueCount).toBe(REVIEW_CARD_CAP + 10);
  });

  it('aggregates cards across multiple flashcard sets (cross-deck is the point)', async () => {
    const rows = [
      row({ id: 'a', flashcardSetId: 'set-a', setTitle: 'Set A', nextReviewAt: null }),
      row({ id: 'b', flashcardSetId: 'set-b', setTitle: 'Set B', nextReviewAt: null }),
    ];
    mocks.flashcardFindMany.mockResolvedValue(rows);

    const result = await loadReviewQueue('user-1', NOW);
    expect(result.cards.map((c) => c.setId)).toEqual(['set-a', 'set-b']);
    expect(result.cards.map((c) => c.setTitle)).toEqual(['Set A', 'Set B']);
  });

  it('maps images with side/fileName/caption through to the card payload', async () => {
    const rows = [
      row({
        id: 'card-1',
        nextReviewAt: null,
        images: [{ id: 'img-1', side: 'front', fileName: 'diagram.png', caption: 'A diagram' }],
      }),
    ];
    mocks.flashcardFindMany.mockResolvedValue(rows);

    const result = await loadReviewQueue('user-1', NOW);
    expect(result.cards[0].images).toEqual([
      { id: 'img-1', side: 'front', fileName: 'diagram.png', caption: 'A diagram' },
    ]);
  });

  it('returns an empty queue with zero counts when nothing is due', async () => {
    mocks.flashcardFindMany.mockResolvedValue([]);
    const result = await loadReviewQueue('user-1', NOW);
    expect(result).toEqual({ cards: [], dueCount: 0, newCount: 0 });
  });
});

describe('countDueFlashcards', () => {
  it('counts with the same OR(null, <= now) where-clause scoped to the user', async () => {
    mocks.flashcardCount.mockResolvedValue(7);
    const count = await countDueFlashcards('user-1', NOW);
    expect(count).toBe(7);
    expect(mocks.flashcardCount).toHaveBeenCalledWith({
      where: {
        flashcardSet: { userId: 'user-1' },
        OR: [{ nextReviewAt: null }, { nextReviewAt: { lte: NOW } }],
      },
    });
  });
});
