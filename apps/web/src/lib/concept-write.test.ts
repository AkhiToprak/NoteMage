import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';

// ─── mocks ──────────────────────────────────────────────────────────────
//
// `concept-write.ts` talks only to `@/lib/db` (Prisma). Mocked here so
// `recordConceptAttempt` can be exercised as a pure unit against fixture
// data, following the `vi.mock('@/lib/db', ...)`-style idiom used in
// `concept-backfill.test.ts`.

const mocks = vi.hoisted(() => ({
  conceptAttemptEventCreate: vi.fn(),
  conceptMasteryFindUnique: vi.fn(),
  conceptMasteryUpsert: vi.fn(),
  conceptAttemptEventFindFirst: vi.fn(),
  conceptAttemptEventFindMany: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    conceptAttemptEvent: {
      create: mocks.conceptAttemptEventCreate,
      findFirst: mocks.conceptAttemptEventFindFirst,
      findMany: mocks.conceptAttemptEventFindMany,
    },
    conceptMastery: {
      findUnique: mocks.conceptMasteryFindUnique,
      upsert: mocks.conceptMasteryUpsert,
    },
    $transaction: mocks.transaction,
  },
}));

import { recordConceptAttempt, type RecordConceptAttemptParams } from './concept-write';

// ─── fixtures ───────────────────────────────────────────────────────────

const EVENT_AT = new Date('2026-03-15T12:00:00.000Z');

function baseParams(overrides: Partial<RecordConceptAttemptParams> = {}): RecordConceptAttemptParams {
  return {
    conceptId: 'concept-1',
    userId: 'user-1',
    itemType: 'quiz_question',
    itemId: 'q1',
    sourceAttemptId: 'attempt-1',
    questionKind: 'mc',
    isCorrect: true,
    usedHint: false,
    attemptNumber: 1,
    tagWeight: 1.0,
    numOptions: 4,
    eventAt: EVENT_AT,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // The source under test calls `db.$transaction((tx) => runUpdate(tx))`
  // when invoked with the default client — invoke the callback with the
  // same mock client so the tx-scoped calls above are the ones observed.
  mocks.transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
    fn({
      conceptAttemptEvent: {
        create: mocks.conceptAttemptEventCreate,
        findFirst: mocks.conceptAttemptEventFindFirst,
        findMany: mocks.conceptAttemptEventFindMany,
      },
      conceptMastery: {
        findUnique: mocks.conceptMasteryFindUnique,
        upsert: mocks.conceptMasteryUpsert,
      },
    })
  );
  mocks.conceptAttemptEventCreate.mockResolvedValue({ id: 'event-1' });
  mocks.conceptAttemptEventFindFirst.mockResolvedValue(null);
  mocks.conceptAttemptEventFindMany.mockResolvedValue([]);
  mocks.conceptMasteryUpsert.mockResolvedValue({ id: 'mastery-1' });
});

// ─── regression: createdAt set to eventAt ──────────────────────────────

describe('createdAt regression fix', () => {
  it('passes createdAt: eventAt (the exact Date given) into conceptAttemptEvent.create', async () => {
    mocks.conceptMasteryFindUnique.mockResolvedValue(null);

    await recordConceptAttempt(baseParams({ eventAt: EVENT_AT }));

    expect(mocks.conceptAttemptEventCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        createdAt: EVENT_AT,
      }),
    });
    const [[callArg]] = mocks.conceptAttemptEventCreate.mock.calls;
    expect(callArg.data.createdAt).toBe(EVENT_AT);
  });
});

// ─── replay path ────────────────────────────────────────────────────────

describe('replay (unique violation)', () => {
  it('returns null and never touches ConceptMastery when create rejects with P2002', async () => {
    const duplicate = new Prisma.PrismaClientKnownRequestError('duplicate', {
      code: 'P2002',
      clientVersion: 'test',
      meta: { target: ['sourceAttemptId', 'conceptId', 'itemId'] },
    });
    mocks.conceptAttemptEventCreate.mockRejectedValueOnce(duplicate);

    const result = await recordConceptAttempt(baseParams());

    expect(result).toBeNull();
    expect(mocks.conceptMasteryFindUnique).not.toHaveBeenCalled();
    expect(mocks.conceptMasteryUpsert).not.toHaveBeenCalled();
    // A true replay no-op never even opens the transaction that would
    // read/write ConceptMastery.
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('rethrows non-P2002 errors from the create call', async () => {
    mocks.conceptAttemptEventCreate.mockRejectedValueOnce(new Error('connection reset'));

    await expect(recordConceptAttempt(baseParams())).rejects.toThrow('connection reset');
    expect(mocks.conceptMasteryFindUnique).not.toHaveBeenCalled();
  });
});

// ─── happy path ─────────────────────────────────────────────────────────

describe('happy path', () => {
  it('returns { band, prevStatus } with the raw stored status and persists the gate-resolved band', async () => {
    // Existing row: status 'weak', low evidence so a single correct event
    // classifies as 'building' pre-gate — resolveGraduationBand then maps
    // (building, wasStruggling=true) -> 'strengthening', not 'solid'.
    mocks.conceptMasteryFindUnique.mockResolvedValue({
      id: 'mastery-1',
      userId: 'user-1',
      conceptId: 'concept-1',
      weightedCorrect: 0,
      weightedTotal: 0,
      attemptCount: 0,
      lastAttemptAt: null,
      lastCorrectAt: null,
      peakLcb: 0,
      status: 'weak',
    });
    // No prior incorrect event -> lastIncorrect cutoff is unbounded.
    mocks.conceptAttemptEventFindFirst.mockResolvedValue(null);
    // Only the just-inserted correct event counts toward distinct days.
    mocks.conceptAttemptEventFindMany.mockResolvedValue([{ createdAt: EVENT_AT }]);

    const result = await recordConceptAttempt(baseParams({ isCorrect: true }));

    expect(result).toEqual({ band: 'strengthening', prevStatus: 'weak' });

    expect(mocks.conceptMasteryUpsert).toHaveBeenCalledTimes(1);
    const [upsertArg] = mocks.conceptMasteryUpsert.mock.calls[0];
    expect(upsertArg.where).toEqual({ userId_conceptId: { userId: 'user-1', conceptId: 'concept-1' } });
    expect(upsertArg.update.status).toBe('strengthening');
    expect(upsertArg.create.status).toBe('strengthening');

    // The two §2.4 gate queries are issued with the documented isCorrect
    // filters.
    expect(mocks.conceptAttemptEventFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 'user-1', conceptId: 'concept-1', isCorrect: false }),
      })
    );
    expect(mocks.conceptAttemptEventFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 'user-1', conceptId: 'concept-1', isCorrect: true }),
      })
    );
  });
});
