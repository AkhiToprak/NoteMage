import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── mocks ──────────────────────────────────────────────────────────────
//
// `trackFlashcardGrades` (concept-tracking.ts) talks to two modules: the DB
// (`@/lib/db`, only `conceptTag.findMany`) and `recordConceptAttempt`
// (`@/lib/concept-write`). Both mocked so the function can be exercised as a
// pure unit against fixture data, mirroring `concept-backfill.test.ts`'s
// mocking style.

const mocks = vi.hoisted(() => ({
  recordConceptAttempt: vi.fn(),
  conceptTagFindMany: vi.fn(),
}));

vi.mock('@/lib/concept-write', () => ({
  recordConceptAttempt: mocks.recordConceptAttempt,
}));

vi.mock('@/lib/db', () => ({
  db: {
    conceptTag: { findMany: mocks.conceptTagFindMany },
  },
}));

vi.mock('@/lib/background-jobs', () => ({
  enqueueJob: vi.fn(),
}));

import { trackFlashcardGrades } from './concept-tracking';
import { SOURCE_WEIGHT_FLASHCARD_SELF_GRADE } from './concept-mastery';

const USER_ID = 'user-1';
const SOURCE_ATTEMPT_ID = 'batch-1';
const NOW = new Date('2026-07-01T12:00:00.000Z');

function tag(overrides: Partial<{ id: string; conceptId: string; itemType: string; itemId: string; weight: number }> = {}) {
  return {
    id: 'tag-1',
    conceptId: 'concept-1',
    itemType: 'flashcard',
    itemId: 'card-1',
    weight: 1.0,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.conceptTagFindMany.mockResolvedValue([]);
  mocks.recordConceptAttempt.mockResolvedValue({ band: 'building', prevStatus: null });
});

describe('trackFlashcardGrades: tagged cards', () => {
  it('no-ops on an empty grades array without touching the DB', async () => {
    await trackFlashcardGrades({ userId: USER_ID, sourceAttemptId: SOURCE_ATTEMPT_ID, grades: [], now: NOW });
    expect(mocks.conceptTagFindMany).not.toHaveBeenCalled();
    expect(mocks.recordConceptAttempt).not.toHaveBeenCalled();
  });

  it('writes one event per tag with origin=flashcard_review, kind=flashcard_review, sourceWeight=0.35', async () => {
    mocks.conceptTagFindMany.mockResolvedValue([tag({ itemId: 'card-1', conceptId: 'concept-1' })]);

    await trackFlashcardGrades({
      userId: USER_ID,
      sourceAttemptId: SOURCE_ATTEMPT_ID,
      grades: [{ cardId: 'card-1', quality: 4 }],
      now: NOW,
    });

    expect(mocks.recordConceptAttempt).toHaveBeenCalledTimes(1);
    expect(mocks.recordConceptAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        conceptId: 'concept-1',
        userId: USER_ID,
        itemType: 'flashcard',
        itemId: 'card-1',
        sourceAttemptId: SOURCE_ATTEMPT_ID,
        questionKind: 'flashcard_review',
        isCorrect: true,
        tagWeight: 1.0,
        eventAt: NOW,
        sourceWeight: SOURCE_WEIGHT_FLASHCARD_SELF_GRADE,
        origin: 'flashcard_review',
      })
    );
  });

  it('Again (0) -> isCorrect: false', async () => {
    mocks.conceptTagFindMany.mockResolvedValue([tag()]);
    await trackFlashcardGrades({
      userId: USER_ID,
      sourceAttemptId: SOURCE_ATTEMPT_ID,
      grades: [{ cardId: 'card-1', quality: 0 }],
      now: NOW,
    });
    expect(mocks.recordConceptAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ isCorrect: false })
    );
  });

  it('Hard (3) -> isCorrect: true, usedHint: true (reuses the struggle-pass discount path)', async () => {
    mocks.conceptTagFindMany.mockResolvedValue([tag()]);
    await trackFlashcardGrades({
      userId: USER_ID,
      sourceAttemptId: SOURCE_ATTEMPT_ID,
      grades: [{ cardId: 'card-1', quality: 3 }],
      now: NOW,
    });
    expect(mocks.recordConceptAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ isCorrect: true, usedHint: true })
    );
  });

  it('Good (4) and Easy (5) -> isCorrect: true, usedHint: false, attemptNumber: 1 (full credit)', async () => {
    mocks.conceptTagFindMany.mockResolvedValue([tag()]);

    await trackFlashcardGrades({
      userId: USER_ID,
      sourceAttemptId: SOURCE_ATTEMPT_ID,
      grades: [{ cardId: 'card-1', quality: 4 }],
      now: NOW,
    });
    expect(mocks.recordConceptAttempt).toHaveBeenLastCalledWith(
      expect.objectContaining({ isCorrect: true, usedHint: false, attemptNumber: 1 })
    );

    mocks.recordConceptAttempt.mockClear();
    await trackFlashcardGrades({
      userId: USER_ID,
      sourceAttemptId: SOURCE_ATTEMPT_ID,
      grades: [{ cardId: 'card-1', quality: 5 }],
      now: NOW,
    });
    expect(mocks.recordConceptAttempt).toHaveBeenLastCalledWith(
      expect.objectContaining({ isCorrect: true, usedHint: false, attemptNumber: 1 })
    );
  });

  it('writes one event per tag for a dual-tagged card (primary + secondary weight passed through)', async () => {
    mocks.conceptTagFindMany.mockResolvedValue([
      tag({ id: 'tag-1', conceptId: 'concept-1', weight: 1.0 }),
      tag({ id: 'tag-2', conceptId: 'concept-2', weight: 0.5 }),
    ]);

    await trackFlashcardGrades({
      userId: USER_ID,
      sourceAttemptId: SOURCE_ATTEMPT_ID,
      grades: [{ cardId: 'card-1', quality: 4 }],
      now: NOW,
    });

    expect(mocks.recordConceptAttempt).toHaveBeenCalledTimes(2);
    expect(mocks.recordConceptAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ conceptId: 'concept-1', tagWeight: 1.0 })
    );
    expect(mocks.recordConceptAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ conceptId: 'concept-2', tagWeight: 0.5 })
    );
  });

  it('grades multiple cards in one call, each independently tagged', async () => {
    mocks.conceptTagFindMany.mockResolvedValue([
      tag({ itemId: 'card-1', conceptId: 'concept-1' }),
      tag({ itemId: 'card-2', conceptId: 'concept-2' }),
    ]);

    await trackFlashcardGrades({
      userId: USER_ID,
      sourceAttemptId: SOURCE_ATTEMPT_ID,
      grades: [
        { cardId: 'card-1', quality: 4 },
        { cardId: 'card-2', quality: 0 },
      ],
      now: NOW,
    });

    expect(mocks.recordConceptAttempt).toHaveBeenCalledTimes(2);
    expect(mocks.conceptTagFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { itemType: 'flashcard', itemId: { in: ['card-1', 'card-2'] } },
      })
    );
  });
});

describe('trackFlashcardGrades: untagged cards', () => {
  it('skips untagged cards without calling recordConceptAttempt or enqueueing backfill', async () => {
    mocks.conceptTagFindMany.mockResolvedValue([]);
    await trackFlashcardGrades({
      userId: USER_ID,
      sourceAttemptId: SOURCE_ATTEMPT_ID,
      grades: [{ cardId: 'untagged-card', quality: 4 }],
      now: NOW,
    });
    expect(mocks.recordConceptAttempt).not.toHaveBeenCalled();
  });

  it('a mix of tagged and untagged cards only writes events for the tagged one', async () => {
    mocks.conceptTagFindMany.mockResolvedValue([tag({ itemId: 'card-1', conceptId: 'concept-1' })]);
    await trackFlashcardGrades({
      userId: USER_ID,
      sourceAttemptId: SOURCE_ATTEMPT_ID,
      grades: [
        { cardId: 'card-1', quality: 4 },
        { cardId: 'card-2', quality: 4 },
      ],
      now: NOW,
    });
    expect(mocks.recordConceptAttempt).toHaveBeenCalledTimes(1);
    expect(mocks.recordConceptAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: 'card-1' })
    );
  });
});

describe('trackFlashcardGrades: never-throws discipline', () => {
  it('a failing recordConceptAttempt for one tag is caught and does not throw or abort the call', async () => {
    mocks.conceptTagFindMany.mockResolvedValue([tag()]);
    mocks.recordConceptAttempt.mockRejectedValue(new Error('boom'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      trackFlashcardGrades({
        userId: USER_ID,
        sourceAttemptId: SOURCE_ATTEMPT_ID,
        grades: [{ cardId: 'card-1', quality: 4 }],
        now: NOW,
      })
    ).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('a failing conceptTag lookup is caught and does not throw', async () => {
    mocks.conceptTagFindMany.mockRejectedValue(new Error('db down'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      trackFlashcardGrades({
        userId: USER_ID,
        sourceAttemptId: SOURCE_ATTEMPT_ID,
        grades: [{ cardId: 'card-1', quality: 4 }],
        now: NOW,
      })
    ).resolves.toBeUndefined();

    expect(mocks.recordConceptAttempt).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('one failing tag among several still lets the rest proceed', async () => {
    mocks.conceptTagFindMany.mockResolvedValue([
      tag({ id: 'tag-1', conceptId: 'concept-1', itemId: 'card-1' }),
      tag({ id: 'tag-2', conceptId: 'concept-2', itemId: 'card-2' }),
    ]);
    mocks.recordConceptAttempt
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ band: 'building', prevStatus: null });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await trackFlashcardGrades({
      userId: USER_ID,
      sourceAttemptId: SOURCE_ATTEMPT_ID,
      grades: [
        { cardId: 'card-1', quality: 4 },
        { cardId: 'card-2', quality: 4 },
      ],
      now: NOW,
    });

    expect(mocks.recordConceptAttempt).toHaveBeenCalledTimes(2);
    errorSpy.mockRestore();
  });
});
