import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Focused test for the misconception-enqueue branch of `trackConceptAttempts`
// (Phase 5 / audit M2a): a weak-band TRANSITION enqueues ONE per-user batch
// job by default, or falls back to per-concept jobs under the
// MISCONCEPTION_BATCH_DISABLED kill switch. The DB, the concept-write helper,
// and enqueueJob are all mocked so the branch runs as a pure unit.

const mocks = vi.hoisted(() => ({
  conceptTagFindMany: vi.fn(),
  quizSetFindUnique: vi.fn(),
  recordConceptAttempt: vi.fn(),
  enqueueJob: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    conceptTag: { findMany: mocks.conceptTagFindMany },
    quizSet: { findUnique: mocks.quizSetFindUnique },
  },
}));

vi.mock('@/lib/concept-write', () => ({
  recordConceptAttempt: mocks.recordConceptAttempt,
}));

vi.mock('@/lib/background-jobs', () => ({
  enqueueJob: mocks.enqueueJob,
}));

// concept-mastery only exports a constant used at import time.
vi.mock('@/lib/concept-mastery', () => ({
  SOURCE_WEIGHT_FLASHCARD_SELF_GRADE: 0.35,
}));

import { trackConceptAttempts } from './concept-tracking';

const USER_ID = 'user-1';
const CONCEPT_ID = 'concept-1';

const baseArgs = () => ({
  userId: USER_ID,
  sourceAttemptId: 'attempt-1',
  quizSetId: 'set-1',
  now: new Date('2026-07-07T00:00:00Z'),
  answers: [{ questionId: 'q1', questionKind: 'mc', isCorrect: false, numOptions: 4 }],
});

beforeEach(() => {
  vi.clearAllMocks();
  // One tag on q1 → recordConceptAttempt runs for it.
  mocks.conceptTagFindMany.mockResolvedValue([
    { itemId: 'q1', conceptId: CONCEPT_ID, weight: 1 },
  ]);
  // Weak-band TRANSITION: band weak, prevStatus not weak → misconception fires.
  mocks.recordConceptAttempt.mockResolvedValue({ band: 'weak', prevStatus: 'building' });
  mocks.enqueueJob.mockResolvedValue(undefined);
});

afterEach(() => {
  delete process.env.MISCONCEPTION_BATCH_DISABLED;
});

describe('misconception enqueue on weak-band transition', () => {
  it('default: enqueues ONE per-user concept.misconception.batch job (2-min debounce)', async () => {
    await trackConceptAttempts(baseArgs());

    const batchCalls = mocks.enqueueJob.mock.calls.filter((c) => c[0] === 'concept.misconception.batch');
    expect(batchCalls).toHaveLength(1);
    const [, payload, options] = batchCalls[0] as [
      string,
      { userId: string },
      { dedupeKey: string; runAt: Date },
    ];
    expect(payload).toEqual({ userId: USER_ID });
    expect(options.dedupeKey).toBe(`concept.misconception.batch:${USER_ID}`);
    // ~2 minutes in the future.
    expect(options.runAt.getTime()).toBeGreaterThan(Date.now() + 60_000);
    // No per-concept job in the default path.
    expect(mocks.enqueueJob.mock.calls.some((c) => c[0] === 'concept.misconception')).toBe(false);
  });

  it('kill switch: MISCONCEPTION_BATCH_DISABLED=1 falls back to per-concept concept.misconception jobs', async () => {
    process.env.MISCONCEPTION_BATCH_DISABLED = '1';

    await trackConceptAttempts(baseArgs());

    const perConcept = mocks.enqueueJob.mock.calls.filter((c) => c[0] === 'concept.misconception');
    expect(perConcept).toHaveLength(1);
    const [, payload, options] = perConcept[0] as [
      string,
      { conceptId: string; userId: string },
      { dedupeKey: string },
    ];
    expect(payload).toEqual({ conceptId: CONCEPT_ID, userId: USER_ID });
    expect(options.dedupeKey).toBe(`concept.misconception:${CONCEPT_ID}`);
    // No batch job under the kill switch.
    expect(mocks.enqueueJob.mock.calls.some((c) => c[0] === 'concept.misconception.batch')).toBe(false);
  });

  it('non-transition (already weak) does not enqueue misconception at all', async () => {
    mocks.recordConceptAttempt.mockResolvedValue({ band: 'weak', prevStatus: 'weak' });

    await trackConceptAttempts(baseArgs());

    expect(mocks.enqueueJob.mock.calls.some((c) => String(c[0]).startsWith('concept.misconception'))).toBe(false);
  });
});
