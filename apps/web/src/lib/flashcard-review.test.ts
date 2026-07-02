import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── mocks ──────────────────────────────────────────────────────────────
//
// `flashcard-review.ts` talks only to `@/lib/db` (`flashcard.findMany`,
// `flashcard.update`, `flashcard.updateMany`, `$transaction`). Mocked so
// `applyReviewGrades` / `applySeedOnly` can be exercised as pure units
// against fixture rows, mirroring `concept-tracking-flashcards.test.ts`'s
// mocking style. `$transaction` is mocked to just resolve each queued
// promise, matching Prisma's array-form `$transaction` semantics closely
// enough for this test's purposes (each `db.flashcard.update` call below
// resolves immediately since it's itself a mock).

const mocks = vi.hoisted(() => ({
  flashcardFindMany: vi.fn(),
  flashcardUpdate: vi.fn(),
  flashcardUpdateMany: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    flashcard: {
      findMany: mocks.flashcardFindMany,
      update: mocks.flashcardUpdate,
      updateMany: mocks.flashcardUpdateMany,
    },
    $transaction: mocks.transaction,
  },
}));

import {
  applyReviewGrades,
  applySeedOnly,
  validateGrades,
  FlashcardReviewValidationError,
  FlashcardReviewNotFoundError,
  MAX_GRADES_PER_BATCH,
} from './flashcard-review';
import { sm2Lite } from './spaced-repetition';

const USER_ID = 'user-1';
const NOW = new Date('2026-07-01T12:00:00.000Z');

function card(overrides: Partial<{
  id: string;
  easeFactor: number;
  interval: number;
  repetitions: number;
  lapses: number;
  nextReviewAt: Date | null;
}> = {}) {
  return {
    id: 'card-1',
    easeFactor: 2.5,
    interval: 6,
    repetitions: 2,
    lapses: 0,
    nextReviewAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: $transaction just awaits every queued promise, like Prisma's
  // array form does for a list of already-created update promises.
  mocks.transaction.mockImplementation(async (ops: Promise<unknown>[]) => Promise.all(ops));
  mocks.flashcardUpdate.mockResolvedValue({});
});

describe('validateGrades', () => {
  it('rejects an empty array', () => {
    expect(() => validateGrades([])).toThrow(FlashcardReviewValidationError);
  });

  it('rejects a non-array', () => {
    expect(() => validateGrades(null)).toThrow(FlashcardReviewValidationError);
    expect(() => validateGrades('nope')).toThrow(FlashcardReviewValidationError);
  });

  it(`rejects a batch longer than ${MAX_GRADES_PER_BATCH}`, () => {
    const grades = Array.from({ length: MAX_GRADES_PER_BATCH + 1 }, (_, i) => ({
      cardId: `card-${i}`,
      quality: 4,
    }));
    expect(() => validateGrades(grades)).toThrow(FlashcardReviewValidationError);
  });

  it('rejects an invalid quality value', () => {
    expect(() => validateGrades([{ cardId: 'card-1', quality: 2 }])).toThrow(
      FlashcardReviewValidationError
    );
    expect(() => validateGrades([{ cardId: 'card-1', quality: 6 }])).toThrow(
      FlashcardReviewValidationError
    );
  });

  it('rejects a missing/empty cardId', () => {
    expect(() => validateGrades([{ quality: 4 }])).toThrow(FlashcardReviewValidationError);
    expect(() => validateGrades([{ cardId: '', quality: 4 }])).toThrow(
      FlashcardReviewValidationError
    );
  });

  it('rejects duplicate cardIds', () => {
    expect(() =>
      validateGrades([
        { cardId: 'card-1', quality: 4 },
        { cardId: 'card-1', quality: 5 },
      ])
    ).toThrow(FlashcardReviewValidationError);
  });

  it('accepts a valid batch and returns it typed', () => {
    const parsed = validateGrades([
      { cardId: 'card-1', quality: 0 },
      { cardId: 'card-2', quality: 3 },
      { cardId: 'card-3', quality: 4 },
      { cardId: 'card-4', quality: 5 },
    ]);
    expect(parsed).toEqual([
      { cardId: 'card-1', quality: 0 },
      { cardId: 'card-2', quality: 3 },
      { cardId: 'card-3', quality: 4 },
      { cardId: 'card-4', quality: 5 },
    ]);
  });
});

describe('applyReviewGrades: happy path', () => {
  it('computes sm2Lite per card and updates all 6 SM-2 columns to hand-computed values', async () => {
    const c1 = card({ id: 'card-1', easeFactor: 2.5, interval: 6, repetitions: 2, lapses: 0 });
    const c2 = card({ id: 'card-2', easeFactor: 2.1, interval: 1, repetitions: 1, lapses: 1 });
    mocks.flashcardFindMany.mockResolvedValue([c1, c2]);

    const expected1 = sm2Lite(4, c1.easeFactor, c1.interval, c1.repetitions, c1.lapses);
    const expected2 = sm2Lite(0, c2.easeFactor, c2.interval, c2.repetitions, c2.lapses);

    const results = await applyReviewGrades(
      USER_ID,
      [
        { cardId: 'card-1', quality: 4 },
        { cardId: 'card-2', quality: 0 },
      ],
      NOW
    );

    expect(mocks.flashcardFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['card-1', 'card-2'] }, flashcardSet: { userId: USER_ID } },
      })
    );

    expect(mocks.flashcardUpdate).toHaveBeenCalledWith({
      where: { id: 'card-1' },
      data: {
        easeFactor: expected1.easeFactor,
        interval: expected1.interval,
        repetitions: expected1.repetitions,
        nextReviewAt: expected1.nextReviewAt,
        lastReviewAt: NOW,
        lapses: expected1.lapses,
      },
    });
    expect(mocks.flashcardUpdate).toHaveBeenCalledWith({
      where: { id: 'card-2' },
      data: {
        easeFactor: expected2.easeFactor,
        interval: expected2.interval,
        repetitions: expected2.repetitions,
        nextReviewAt: expected2.nextReviewAt,
        lastReviewAt: NOW,
        lapses: expected2.lapses,
      },
    });

    expect(results).toEqual([
      {
        cardId: 'card-1',
        interval: expected1.interval,
        nextReviewAt: expected1.nextReviewAt.toISOString(),
        isLeech: expected1.isLeech,
      },
      {
        cardId: 'card-2',
        interval: expected2.interval,
        nextReviewAt: expected2.nextReviewAt.toISOString(),
        isLeech: expected2.isLeech,
      },
    ]);
  });

  it('flags isLeech once lapses crosses LEECH_THRESHOLD', async () => {
    // repetitions >= 2 and quality < 3 => this Again increments lapses.
    const c = card({ id: 'card-1', easeFactor: 1.3, interval: 10, repetitions: 3, lapses: 3 });
    mocks.flashcardFindMany.mockResolvedValue([c]);

    const results = await applyReviewGrades(USER_ID, [{ cardId: 'card-1', quality: 0 }], NOW);

    expect(results[0].isLeech).toBe(true);
  });
});

describe('applyReviewGrades: IDOR guard', () => {
  it('rejects when a card is not owned by the user (foreign card excluded by the where clause)', async () => {
    // Simulate the where-clause filtering out a foreign card: only 1 of 2
    // requested cards comes back.
    mocks.flashcardFindMany.mockResolvedValue([card({ id: 'card-1' })]);

    await expect(
      applyReviewGrades(
        USER_ID,
        [
          { cardId: 'card-1', quality: 4 },
          { cardId: 'foreign-card', quality: 4 },
        ],
        NOW
      )
    ).rejects.toThrow(FlashcardReviewNotFoundError);

    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('rejects when the entire set belongs to another user (zero rows returned)', async () => {
    mocks.flashcardFindMany.mockResolvedValue([]);

    await expect(
      applyReviewGrades(USER_ID, [{ cardId: 'card-1', quality: 4 }], NOW)
    ).rejects.toThrow(FlashcardReviewNotFoundError);

    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});

describe('applyReviewGrades: transaction all-or-nothing', () => {
  it('a mid-batch failure rejects the whole call and updates nothing observable', async () => {
    mocks.flashcardFindMany.mockResolvedValue([card({ id: 'card-1' }), card({ id: 'card-2' })]);
    mocks.transaction.mockRejectedValue(new Error('db exploded mid-batch'));

    await expect(
      applyReviewGrades(
        USER_ID,
        [
          { cardId: 'card-1', quality: 4 },
          { cardId: 'card-2', quality: 4 },
        ],
        NOW
      )
    ).rejects.toThrow('db exploded mid-batch');
  });
});

describe('applySeedOnly', () => {
  it('no-ops on an empty cardIds array without touching the DB', async () => {
    const result = await applySeedOnly(USER_ID, [], NOW);
    expect(result).toEqual({ seededCount: 0 });
    expect(mocks.flashcardFindMany).not.toHaveBeenCalled();
    expect(mocks.flashcardUpdateMany).not.toHaveBeenCalled();
  });

  it('seeds nextReviewAt to tomorrow-midnight, scoped to nextReviewAt: null', async () => {
    mocks.flashcardFindMany.mockResolvedValue([{ id: 'card-1' }, { id: 'card-2' }]);
    mocks.flashcardUpdateMany.mockResolvedValue({ count: 2 });

    const result = await applySeedOnly(USER_ID, ['card-1', 'card-2'], NOW);

    const expectedTomorrow = new Date(NOW);
    expectedTomorrow.setDate(expectedTomorrow.getDate() + 1);
    expectedTomorrow.setHours(0, 0, 0, 0);

    expect(mocks.flashcardUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ['card-1', 'card-2'] }, flashcardSet: { userId: USER_ID }, nextReviewAt: null },
      data: { nextReviewAt: expectedTomorrow },
    });
    expect(result).toEqual({ seededCount: 2 });
  });

  it('only touches never-reviewed cards — updateMany where clause always includes nextReviewAt: null', async () => {
    mocks.flashcardFindMany.mockResolvedValue([{ id: 'card-1' }]);
    mocks.flashcardUpdateMany.mockResolvedValue({ count: 0 });

    await applySeedOnly(USER_ID, ['card-1'], NOW);

    const call = mocks.flashcardUpdateMany.mock.calls[0][0];
    expect(call.where.nextReviewAt).toBeNull();
  });

  it('rejects when a requested card is not owned by the user', async () => {
    mocks.flashcardFindMany.mockResolvedValue([{ id: 'card-1' }]);

    await expect(applySeedOnly(USER_ID, ['card-1', 'foreign-card'], NOW)).rejects.toThrow(
      FlashcardReviewNotFoundError
    );
    expect(mocks.flashcardUpdateMany).not.toHaveBeenCalled();
  });
});
