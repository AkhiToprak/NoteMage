import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── mocks ──────────────────────────────────────────────────────────────
//
// `concept-backfill.ts` talks to five modules: the DB (`@/lib/db`), the
// feature flag gate, the model router, the three provider-specific forced-
// tool callers, and the shared concept-write helpers. All are mocked here so
// `runConceptBackfill` can be exercised as a pure unit against fixture data.

const mocks = vi.hoisted(() => ({
  weaknessConceptsEnabled: vi.fn(),
  resolveModel: vi.fn(),
  forcedStructuredCallOpenRouter: vi.fn(),
  forcedStructuredCallGemini: vi.fn(),
  persistSlotConcepts: vi.fn(),
  attachConceptTags: vi.fn(),
  recordConceptAttempt: vi.fn(),
  checkpointSlotFindUnique: vi.fn(),
  conceptCount: vi.fn(),
  conceptTagFindMany: vi.fn(),
  quizAnswerFindMany: vi.fn(),
}));

vi.mock('@/lib/feature-flags', () => ({
  weaknessConceptsEnabled: mocks.weaknessConceptsEnabled,
}));

vi.mock('@/lib/model-routing', () => ({
  resolveModel: mocks.resolveModel,
}));

vi.mock('@/lib/path-generator-openrouter', () => ({
  forcedStructuredCallOpenRouter: mocks.forcedStructuredCallOpenRouter,
}));

vi.mock('@/lib/path-generator-gemini', () => ({
  forcedStructuredCallGemini: mocks.forcedStructuredCallGemini,
}));

vi.mock('@/lib/concept-write', () => ({
  persistSlotConcepts: mocks.persistSlotConcepts,
  attachConceptTags: mocks.attachConceptTags,
  recordConceptAttempt: mocks.recordConceptAttempt,
}));

vi.mock('@/lib/db', () => ({
  db: {
    checkpointSlot: { findUnique: mocks.checkpointSlotFindUnique },
    concept: { count: mocks.conceptCount },
    conceptTag: { findMany: mocks.conceptTagFindMany },
    quizAnswer: { findMany: mocks.quizAnswerFindMany },
  },
}));

import { runConceptBackfill } from './concept-backfill';

// ─── fixtures ───────────────────────────────────────────────────────────

const SLOT_ID = 'slot-1';
const PLAN_ID = 'plan-1';

function makeSlot(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: SLOT_ID,
    title: 'Regular -ar verbs',
    objective: 'Conjugate -ar verbs in present tense',
    phase: { planId: PLAN_ID },
    activities: [
      {
        kind: 'quiz',
        quizSet: {
          questions: [
            { id: 'q1', question: 'Conjugate hablar (yo)', kind: 'mc', options: ['hablo', 'hablas', 'habla', 'hablamos'] },
            { id: 'q2', question: 'Conjugate cantar (tu)', kind: 'true_false', options: [] },
          ],
        },
        flashcardSet: null,
      },
      {
        kind: 'flashcards',
        quizSet: null,
        flashcardSet: {
          flashcards: [{ id: 'c1', question: 'What is the -ar ending for yo?' }],
        },
      },
    ],
    ...overrides,
  };
}

function emptySlot() {
  return {
    id: SLOT_ID,
    title: 'Empty slot',
    objective: null,
    phase: { planId: PLAN_ID },
    activities: [{ kind: 'quiz', quizSet: { questions: [] }, flashcardSet: null }],
  };
}

// Items are addressed by 1-based index into the slot's item list. For
// makeSlot() the order is q1 (1), q2 (2), c1 (3) — mapped back to real itemIds
// server-side by runConceptBackfill.
const CLASSIFY_RESULT = {
  conceptCandidates: ['present-tense -ar stem', '-ar personal endings'],
  items: [
    { index: 1, conceptKeys: ['present-tense -ar stem'] },
    { index: 2, conceptKeys: ['-ar personal endings'] },
    { index: 3, conceptKeys: ['present-tense -ar stem'] },
  ],
};

const CONCEPT_ID_BY_KEY = new Map<string, string>([
  ['present-tense -ar stem', 'concept-1'],
  ['-ar personal endings', 'concept-2'],
]);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.weaknessConceptsEnabled.mockReturnValue(true);
  mocks.resolveModel.mockReturnValue({ provider: 'openrouter', model: 'z-ai/glm-4.7', token: 'glm-flash' });
  mocks.forcedStructuredCallOpenRouter.mockResolvedValue(CLASSIFY_RESULT);
  mocks.persistSlotConcepts.mockResolvedValue(CONCEPT_ID_BY_KEY);
  mocks.attachConceptTags.mockResolvedValue(undefined);
  mocks.recordConceptAttempt.mockResolvedValue('building');
  mocks.conceptTagFindMany.mockResolvedValue([]);
  mocks.quizAnswerFindMany.mockResolvedValue([]);
  mocks.conceptCount.mockResolvedValue(0);
});

// ─── flag guard ─────────────────────────────────────────────────────────

describe('flag guard', () => {
  it('returns immediately with zero DB/LLM calls when weaknessConceptsEnabled() is false', async () => {
    mocks.weaknessConceptsEnabled.mockReturnValue(false);

    await runConceptBackfill(SLOT_ID);

    expect(mocks.checkpointSlotFindUnique).not.toHaveBeenCalled();
    expect(mocks.forcedStructuredCallOpenRouter).not.toHaveBeenCalled();
    expect(mocks.forcedStructuredCallGemini).not.toHaveBeenCalled();
    expect(mocks.persistSlotConcepts).not.toHaveBeenCalled();
  });
});

// ─── slot resolution ────────────────────────────────────────────────────

describe('slot not found', () => {
  it('logs and returns without throwing', async () => {
    mocks.checkpointSlotFindUnique.mockResolvedValue(null);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(runConceptBackfill(SLOT_ID)).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('slot not found'),
      expect.objectContaining({ slotId: SLOT_ID })
    );
    expect(mocks.forcedStructuredCallOpenRouter).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

describe('empty slot', () => {
  it('returns without a classify call when the slot has no questions/flashcards', async () => {
    mocks.checkpointSlotFindUnique.mockResolvedValue(emptySlot());

    await runConceptBackfill(SLOT_ID);

    expect(mocks.forcedStructuredCallOpenRouter).not.toHaveBeenCalled();
    expect(mocks.persistSlotConcepts).not.toHaveBeenCalled();
    expect(mocks.conceptCount).not.toHaveBeenCalled();
  });
});

// ─── idempotency ────────────────────────────────────────────────────────

/**
 * `db.conceptTag.findMany` is called with two distinct shapes in
 * `concept-backfill.ts`:
 *   - the idempotency guard: a combined `where.OR` query across both
 *     quiz_question and flashcard itemIds (no `weight` selected).
 *   - `loadConceptTagsByQuestion`: a plain `where.itemType === 'quiz_question'`
 *     query (with `weight` selected), used both from the idempotency
 *     short-circuit and from the fresh-classify path.
 * This helper builds a mock implementation that answers each shape from
 * fixture data, so tests don't have to special-case call order.
 */
function conceptTagFindManyMock(opts: {
  taggedItemIds?: string[];
  quizTagsByQuestion?: Record<string, { conceptId: string; weight: number }[]>;
}) {
  const taggedItemIds = new Set(opts.taggedItemIds ?? []);
  const quizTagsByQuestion = opts.quizTagsByQuestion ?? {};

  return ({ where }: { where: { OR?: unknown; itemType?: string; itemId?: { in: string[] } } }) => {
    if (where.OR) {
      // idempotency guard — return one row per already-tagged itemId.
      return Promise.resolve(
        Array.from(taggedItemIds).map((itemId) => ({ itemId }))
      );
    }
    if (where.itemType === 'quiz_question') {
      const ids = where.itemId?.in ?? [];
      const rows = ids.flatMap((id) =>
        (quizTagsByQuestion[id] ?? []).map((tag) => ({ itemId: id, ...tag }))
      );
      return Promise.resolve(rows);
    }
    return Promise.resolve([]);
  };
}

describe('fully-classified idempotency', () => {
  it('skips the classify call but still runs bounded event backfill when everything is already tagged', async () => {
    mocks.checkpointSlotFindUnique.mockResolvedValue(makeSlot());
    mocks.conceptCount.mockResolvedValue(2); // Concept rows already exist
    // Every item (q1, q2, c1) already has a ConceptTag.
    mocks.conceptTagFindMany.mockImplementation(
      conceptTagFindManyMock({
        taggedItemIds: ['q1', 'q2', 'c1'],
        quizTagsByQuestion: {
          q1: [{ conceptId: 'concept-1', weight: 1.0 }],
          q2: [{ conceptId: 'concept-2', weight: 1.0 }],
        },
      })
    );

    await runConceptBackfill(SLOT_ID);

    // No LLM call of any provider — the (costly) classify step is skipped.
    expect(mocks.forcedStructuredCallOpenRouter).not.toHaveBeenCalled();
    expect(mocks.forcedStructuredCallOpenRouter).not.toHaveBeenCalled();
    expect(mocks.forcedStructuredCallGemini).not.toHaveBeenCalled();
    expect(mocks.persistSlotConcepts).not.toHaveBeenCalled();
    expect(mocks.attachConceptTags).not.toHaveBeenCalled();

    // But the bounded event-backfill pass still ran: it looks up tags-by-
    // question (a second conceptTag.findMany scoped to quiz_question) and
    // queries quizAnswer for the two quiz questions.
    expect(mocks.quizAnswerFindMany).toHaveBeenCalledTimes(2);
  });
});

// ─── fresh classify path ────────────────────────────────────────────────

describe('fresh classify path', () => {
  it('persists concepts + tags via concept-write, then runs bounded event backfill', async () => {
    mocks.checkpointSlotFindUnique.mockResolvedValue(makeSlot());
    mocks.conceptCount.mockResolvedValue(0);
    // Nothing tagged yet for the idempotency guard; after tagging happens
    // in-handler, `loadConceptTagsByQuestion` re-reads the tags this same
    // run just wrote via `attachConceptTags` — reflect that by returning the
    // classify result's per-question keys once resolved through
    // CONCEPT_ID_BY_KEY (mirrors what attachConceptTags would have persisted).
    mocks.conceptTagFindMany.mockImplementation(
      conceptTagFindManyMock({
        taggedItemIds: [],
        quizTagsByQuestion: {
          q1: [{ conceptId: 'concept-1', weight: 1.0 }],
          q2: [{ conceptId: 'concept-2', weight: 1.0 }],
        },
      })
    );

    await runConceptBackfill(SLOT_ID);

    expect(mocks.forcedStructuredCallOpenRouter).toHaveBeenCalledTimes(1);
    expect(mocks.persistSlotConcepts).toHaveBeenCalledWith(
      PLAN_ID,
      SLOT_ID,
      CLASSIFY_RESULT.conceptCandidates
    );

    // Each item with returned conceptKeys gets tagged (q1, q2, c1 all have keys).
    expect(mocks.attachConceptTags).toHaveBeenCalledWith(
      'quiz_question',
      'q1',
      ['present-tense -ar stem'],
      CONCEPT_ID_BY_KEY
    );
    expect(mocks.attachConceptTags).toHaveBeenCalledWith(
      'quiz_question',
      'q2',
      ['-ar personal endings'],
      CONCEPT_ID_BY_KEY
    );
    expect(mocks.attachConceptTags).toHaveBeenCalledWith(
      'flashcard',
      'c1',
      ['present-tense -ar stem'],
      CONCEPT_ID_BY_KEY
    );

    // Event backfill re-queries tags-by-question after tagging, then queries
    // quizAnswer for each of the 2 quiz questions (flashcards excluded).
    expect(mocks.quizAnswerFindMany).toHaveBeenCalledTimes(2);
  });

  it('drops (logs, does not crash) an item whose index is out of range', async () => {
    mocks.checkpointSlotFindUnique.mockResolvedValue(makeSlot());
    mocks.conceptCount.mockResolvedValue(0);
    mocks.conceptTagFindMany.mockResolvedValue([]);
    // index 1 is valid (q1); index 9 has no corresponding item and must be
    // skipped rather than throwing or tagging the wrong item.
    mocks.forcedStructuredCallOpenRouter.mockResolvedValue({
      conceptCandidates: ['present-tense -ar stem', '-ar personal endings'],
      items: [
        { index: 1, conceptKeys: ['present-tense -ar stem'] },
        { index: 9, conceptKeys: ['-ar personal endings'] },
      ],
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(runConceptBackfill(SLOT_ID)).resolves.toBeUndefined();

    // The valid item was tagged; the out-of-range one was not.
    expect(mocks.attachConceptTags).toHaveBeenCalledWith(
      'quiz_question',
      'q1',
      ['present-tense -ar stem'],
      CONCEPT_ID_BY_KEY
    );
    expect(mocks.attachConceptTags).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('out-of-range item index'),
      expect.objectContaining({ slotId: SLOT_ID, index: 9 })
    );
    errorSpy.mockRestore();
  });
});

describe('fewer than 2 concept candidates', () => {
  it('logs and skips persistence when the classify call returns <2 candidates', async () => {
    mocks.checkpointSlotFindUnique.mockResolvedValue(makeSlot());
    mocks.conceptCount.mockResolvedValue(0);
    mocks.conceptTagFindMany.mockResolvedValue([]);
    mocks.forcedStructuredCallOpenRouter.mockResolvedValue({
      conceptCandidates: ['only-one'],
      items: [],
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await runConceptBackfill(SLOT_ID);

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('fewer than 2 concept candidates'),
      expect.objectContaining({ slotId: SLOT_ID })
    );
    expect(mocks.persistSlotConcepts).not.toHaveBeenCalled();
    expect(mocks.attachConceptTags).not.toHaveBeenCalled();
    expect(mocks.quizAnswerFindMany).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('treats an empty conceptCandidates array the same way', async () => {
    mocks.checkpointSlotFindUnique.mockResolvedValue(makeSlot());
    mocks.conceptCount.mockResolvedValue(0);
    mocks.conceptTagFindMany.mockResolvedValue([]);
    mocks.forcedStructuredCallOpenRouter.mockResolvedValue({ conceptCandidates: [], items: [] });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await runConceptBackfill(SLOT_ID);

    expect(mocks.persistSlotConcepts).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

// ─── never throws ───────────────────────────────────────────────────────

describe('never throws', () => {
  it('resolves (does not reject) when a DB error occurs mid-run, and logs it', async () => {
    mocks.checkpointSlotFindUnique.mockResolvedValue(makeSlot());
    mocks.conceptCount.mockRejectedValue(new Error('connection reset'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(runConceptBackfill(SLOT_ID)).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledWith(
      '[concept-backfill] failed',
      expect.objectContaining({ slotId: SLOT_ID, error: 'connection reset' })
    );
    errorSpy.mockRestore();
  });

  it('resolves even when the classify LLM call itself throws', async () => {
    mocks.checkpointSlotFindUnique.mockResolvedValue(makeSlot());
    mocks.conceptCount.mockResolvedValue(0);
    mocks.conceptTagFindMany.mockResolvedValue([]);
    mocks.forcedStructuredCallOpenRouter.mockRejectedValue(new Error('provider 500'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(runConceptBackfill(SLOT_ID)).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledWith(
      '[concept-backfill] failed',
      expect.objectContaining({ slotId: SLOT_ID, error: 'provider 500' })
    );
    errorSpy.mockRestore();
  });

  it('resolves even when persistSlotConcepts throws', async () => {
    mocks.checkpointSlotFindUnique.mockResolvedValue(makeSlot());
    mocks.conceptCount.mockResolvedValue(0);
    mocks.conceptTagFindMany.mockResolvedValue([]);
    mocks.persistSlotConcepts.mockRejectedValue(new Error('unique violation'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(runConceptBackfill(SLOT_ID)).resolves.toBeUndefined();
    errorSpy.mockRestore();
  });
});

// ─── bounded event backfill ─────────────────────────────────────────────

describe('bounded event backfill', () => {
  it('queries quizAnswer with take:50 and a 90-day createdAt cutoff, and never queries flashcards', async () => {
    mocks.checkpointSlotFindUnique.mockResolvedValue(makeSlot());
    mocks.conceptCount.mockResolvedValue(0);
    // After tagging, both quiz questions carry the concept tags emitted by
    // the classify call above.
    mocks.conceptTagFindMany.mockImplementation(
      conceptTagFindManyMock({
        quizTagsByQuestion: {
          q1: [{ conceptId: 'concept-1', weight: 1.0 }],
          q2: [{ conceptId: 'concept-2', weight: 1.0 }],
        },
      })
    );

    const before = Date.now();
    await runConceptBackfill(SLOT_ID);
    const after = Date.now();

    expect(mocks.quizAnswerFindMany).toHaveBeenCalledTimes(2);
    for (const call of mocks.quizAnswerFindMany.mock.calls) {
      const args = call[0] as {
        where: { questionId: string; createdAt: { gte: Date } };
        take: number;
        orderBy: { createdAt: string };
      };
      expect(args.take).toBe(50);
      expect(args.orderBy).toEqual({ createdAt: 'desc' });
      expect(['q1', 'q2']).toContain(args.where.questionId);

      const cutoff = args.where.createdAt.gte;
      const expectedCutoffMs = 90 * 24 * 60 * 60 * 1000;
      // cutoff should be ~90 days before "now" (allow a small window for
      // test execution time between the two Date.now() bookends above).
      expect(before - cutoff.getTime()).toBeGreaterThanOrEqual(expectedCutoffMs - 5_000);
      expect(after - cutoff.getTime()).toBeLessThanOrEqual(expectedCutoffMs + 5_000);
    }

    // Flashcards (c1) are never event-backfilled — no ConceptTag lookup or
    // QuizAnswer query keyed on itemType 'flashcard' feeds backfillEvents.
    const flashcardEventCalls = mocks.recordConceptAttempt.mock.calls.filter(
      ([params]) => (params as { itemType: string }).itemType === 'flashcard'
    );
    expect(flashcardEventCalls).toHaveLength(0);
  });

  it('records one concept-attempt event per (answer, tag) pair via recordConceptAttempt', async () => {
    mocks.checkpointSlotFindUnique.mockResolvedValue(makeSlot());
    mocks.conceptCount.mockResolvedValue(0);
    mocks.conceptTagFindMany.mockImplementation(
      conceptTagFindManyMock({
        quizTagsByQuestion: { q1: [{ conceptId: 'concept-1', weight: 1.0 }] },
      })
    );
    mocks.quizAnswerFindMany.mockImplementation(({ where }: { where: { questionId: string } }) => {
      if (where.questionId === 'q1') {
        return Promise.resolve([
          {
            id: 'answer-1',
            isCorrect: true,
            createdAt: new Date(),
            attempt: { id: 'attempt-1', userId: 'user-1' },
          },
        ]);
      }
      return Promise.resolve([]);
    });

    await runConceptBackfill(SLOT_ID);

    expect(mocks.recordConceptAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        conceptId: 'concept-1',
        userId: 'user-1',
        itemType: 'quiz_question',
        itemId: 'q1',
        sourceAttemptId: 'attempt-1',
        isCorrect: true,
        tagWeight: 1.0,
      })
    );
  });

  it('skips questions with no concept tags — nothing to attribute events to', async () => {
    mocks.checkpointSlotFindUnique.mockResolvedValue(makeSlot());
    mocks.conceptCount.mockResolvedValue(0);
    mocks.conceptTagFindMany.mockResolvedValue([]); // no tags survive for any question

    await runConceptBackfill(SLOT_ID);

    expect(mocks.quizAnswerFindMany).not.toHaveBeenCalled();
    expect(mocks.recordConceptAttempt).not.toHaveBeenCalled();
  });

  it('a per-answer recordConceptAttempt failure does not abort the rest of the backfill pass', async () => {
    mocks.checkpointSlotFindUnique.mockResolvedValue(makeSlot());
    mocks.conceptCount.mockResolvedValue(0);
    mocks.conceptTagFindMany.mockImplementation(
      conceptTagFindManyMock({
        quizTagsByQuestion: { q1: [{ conceptId: 'concept-1', weight: 1.0 }] },
      })
    );
    mocks.quizAnswerFindMany.mockImplementation(({ where }: { where: { questionId: string } }) => {
      if (where.questionId === 'q1') {
        return Promise.resolve([
          { id: 'a1', isCorrect: true, createdAt: new Date(), attempt: { id: 'attempt-1', userId: 'user-1' } },
          { id: 'a2', isCorrect: false, createdAt: new Date(), attempt: { id: 'attempt-2', userId: 'user-2' } },
        ]);
      }
      return Promise.resolve([]);
    });
    mocks.recordConceptAttempt
      .mockRejectedValueOnce(new Error('transient write failure'))
      .mockResolvedValueOnce('weak');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(runConceptBackfill(SLOT_ID)).resolves.toBeUndefined();

    expect(mocks.recordConceptAttempt).toHaveBeenCalledTimes(2);
    errorSpy.mockRestore();
  });
});

// ─── provider dispatch ──────────────────────────────────────────────────

describe('provider dispatch', () => {
  it('routes to forcedStructuredCallOpenRouter when resolveModel picks openrouter', async () => {
    mocks.checkpointSlotFindUnique.mockResolvedValue(makeSlot());
    mocks.conceptCount.mockResolvedValue(0);
    mocks.conceptTagFindMany.mockResolvedValue([]);
    mocks.resolveModel.mockReturnValue({ provider: 'openrouter', model: 'glm-haiku-id', token: 'glm-haiku' });
    mocks.forcedStructuredCallOpenRouter.mockResolvedValue(CLASSIFY_RESULT);

    await runConceptBackfill(SLOT_ID);

    expect(mocks.forcedStructuredCallOpenRouter).toHaveBeenCalledTimes(1);
    expect(mocks.forcedStructuredCallGemini).not.toHaveBeenCalled();
  });

  it('routes to forcedStructuredCallGemini when resolveModel picks gemini, appending the JSON instruction', async () => {
    mocks.checkpointSlotFindUnique.mockResolvedValue(makeSlot());
    mocks.conceptCount.mockResolvedValue(0);
    mocks.conceptTagFindMany.mockResolvedValue([]);
    mocks.resolveModel.mockReturnValue({ provider: 'gemini', model: 'flash-lite-id', token: 'flash-lite' });
    mocks.forcedStructuredCallGemini.mockResolvedValue(CLASSIFY_RESULT);

    await runConceptBackfill(SLOT_ID);

    expect(mocks.forcedStructuredCallGemini).toHaveBeenCalledTimes(1);
    const [callArgs] = mocks.forcedStructuredCallGemini.mock.calls[0] as [{ systemInstruction: string }];
    expect(callArgs.systemInstruction).toContain('Respond with ONLY a single JSON object');
    expect(mocks.persistSlotConcepts).toHaveBeenCalledWith(
      PLAN_ID,
      SLOT_ID,
      CLASSIFY_RESULT.conceptCandidates
    );
  });

  it('defaults to empty candidates/items when Gemini returns a partial payload', async () => {
    mocks.checkpointSlotFindUnique.mockResolvedValue(makeSlot());
    mocks.conceptCount.mockResolvedValue(0);
    mocks.conceptTagFindMany.mockResolvedValue([]);
    mocks.resolveModel.mockReturnValue({ provider: 'gemini', model: 'flash-lite-id', token: 'flash-lite' });
    mocks.forcedStructuredCallGemini.mockResolvedValue({});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(runConceptBackfill(SLOT_ID)).resolves.toBeUndefined();

    expect(mocks.persistSlotConcepts).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
