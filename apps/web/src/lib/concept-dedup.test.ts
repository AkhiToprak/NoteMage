import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── mocks ──────────────────────────────────────────────────────────────
//
// `concept-dedup.ts` talks to: the DB (`@/lib/db`), the feature flag gate,
// the Gemini client (`@/lib/gemini`), and `enqueueJob` (`@/lib/background-jobs`).
// All are mocked here, mirroring `concept-misconception-tag.test.ts` /
// `concept-edges.test.ts`'s idiom, so `runConceptDedup` /
// `runConceptDedupBackfill` / the enqueue helpers can be exercised as pure
// units against fixture data without a real DB or a real embedding call.

interface ConceptFixture {
  id: string;
  planId: string;
  label: string;
  description: string | null;
  canonicalId: string | null;
  mergedLabelSnapshot: string | null;
  mergedAt: Date | null;
  embedding: number[];
  embeddedAt: Date | null;
  createdAt: Date;
}

const mocks = vi.hoisted(() => {
  const state = {
    concepts: [] as ConceptFixture[],
    plans: [] as { id: string; userId: string }[],
  };

  const conceptFindUnique = vi.fn(async ({ where }: { where: { id: string } }) => {
    const c = state.concepts.find((x) => x.id === where.id);
    if (!c) return null;
    return { ...c };
  });

  const conceptFindMany = vi.fn(
    async ({
      where,
      orderBy,
      take,
    }: {
      where: Record<string, unknown>;
      orderBy?: { createdAt: 'asc' | 'desc' };
      take?: number;
    }) => {
      let rows = state.concepts.slice();

      if ('planId' in where) {
        rows = rows.filter((c) => c.planId === where.planId);
      }
      if ('canonicalId' in where) {
        rows = rows.filter((c) => c.canonicalId === (where.canonicalId as string | null));
      }
      if ('id' in where && where.id && typeof where.id === 'object') {
        const notId = (where.id as { not: string }).not;
        rows = rows.filter((c) => c.id !== notId);
      }
      if ('embeddedAt' in where) {
        rows = rows.filter((c) => c.embeddedAt === (where.embeddedAt as null));
      }
      if ('NOT' in where) {
        const not = where.NOT as { embeddedAt: null };
        rows = rows.filter((c) => c.embeddedAt !== not.embeddedAt);
      }
      if ('plan' in where) {
        const planWhere = where.plan as { userId: string };
        const planIds = new Set(
          state.plans.filter((p) => p.userId === planWhere.userId).map((p) => p.id)
        );
        rows = rows.filter((c) => planIds.has(c.planId));
      }

      if (orderBy?.createdAt === 'desc') {
        rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      } else if (orderBy?.createdAt === 'asc') {
        rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      }

      if (take != null) rows = rows.slice(0, take);
      return rows.map((c) => ({ ...c }));
    }
  );

  const conceptCount = vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
    let rows = state.concepts.slice();
    if ('canonicalId' in where) {
      rows = rows.filter((c) => c.canonicalId === (where.canonicalId as string | null));
    }
    if ('embeddedAt' in where) {
      rows = rows.filter((c) => c.embeddedAt === (where.embeddedAt as null));
    }
    if ('plan' in where) {
      const planWhere = where.plan as { userId: string };
      const planIds = new Set(
        state.plans.filter((p) => p.userId === planWhere.userId).map((p) => p.id)
      );
      rows = rows.filter((c) => planIds.has(c.planId));
    }
    return rows.length;
  });

  const conceptUpdate = vi.fn(
    async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<ConceptFixture>;
    }) => {
      const c = state.concepts.find((x) => x.id === where.id);
      if (!c) throw new Error('not found');
      Object.assign(c, data);
      return { ...c };
    }
  );

  const conceptUpdateMany = vi.fn(
    async ({
      where,
      data,
    }: {
      where: { id: string; canonicalId: null };
      data: Partial<ConceptFixture>;
    }) => {
      const c = state.concepts.find((x) => x.id === where.id && x.canonicalId === where.canonicalId);
      if (!c) return { count: 0 };
      Object.assign(c, data);
      return { count: 1 };
    }
  );

  const studyPlanFindUnique = vi.fn(async ({ where }: { where: { id: string } }) => {
    const p = state.plans.find((x) => x.id === where.id);
    return p ? { userId: p.userId } : null;
  });

  const enqueueJob = vi.fn(
    async (_kind: string, _payload: unknown, _options?: Record<string, unknown>) =>
      ({}) as unknown
  );

  const weaknessConceptDedupEnabled = vi.fn(() => true);

  const embedContent = vi.fn(async () => ({
    embeddings: [{ values: [1, 0, 0] }],
  }));

  const getGeminiClient = vi.fn(() => ({
    models: { embedContent: mocks_embedContentRef() },
  }));

  function mocks_embedContentRef() {
    return embedContent;
  }

  return {
    state,
    conceptFindUnique,
    conceptFindMany,
    conceptCount,
    conceptUpdate,
    conceptUpdateMany,
    studyPlanFindUnique,
    enqueueJob,
    weaknessConceptDedupEnabled,
    embedContent,
    getGeminiClient,
  };
});

vi.mock('@/lib/feature-flags', () => ({
  weaknessConceptDedupEnabled: mocks.weaknessConceptDedupEnabled,
}));

vi.mock('@/lib/background-jobs', () => ({
  enqueueJob: mocks.enqueueJob,
}));

vi.mock('@/lib/gemini', () => ({
  getGeminiClient: mocks.getGeminiClient,
}));

vi.mock('@/lib/db', () => ({
  db: {
    concept: {
      findUnique: mocks.conceptFindUnique,
      findMany: mocks.conceptFindMany,
      count: mocks.conceptCount,
      update: mocks.conceptUpdate,
      updateMany: mocks.conceptUpdateMany,
    },
    studyPlan: {
      findUnique: mocks.studyPlanFindUnique,
    },
  },
}));

import {
  cosineSimilarity,
  COSINE_MATCH_THRESHOLD,
  enqueueConceptDedupForPlan,
  maybeEnqueueDedupBackfill,
  runConceptDedup,
  runConceptDedupBackfill,
} from './concept-dedup';

// ─── fixtures ───────────────────────────────────────────────────────────

const USER_ID = 'user-1';
const PLAN_ID = 'plan-1';

function makeConcept(overrides: Partial<ConceptFixture> & { id: string }): ConceptFixture {
  return {
    planId: PLAN_ID,
    label: 'Regular -ar verb endings',
    description: 'Conjugating -ar verbs in present tense',
    canonicalId: null,
    mergedLabelSnapshot: null,
    mergedAt: null,
    embedding: [],
    embeddedAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

beforeEach(() => {
  mocks.state.concepts = [];
  mocks.state.plans = [{ id: PLAN_ID, userId: USER_ID }];
  mocks.weaknessConceptDedupEnabled.mockReturnValue(true);
  mocks.embedContent.mockReset();
  mocks.embedContent.mockResolvedValue({ embeddings: [{ values: [1, 0, 0] }] });
  mocks.conceptFindUnique.mockClear();
  mocks.conceptFindMany.mockClear();
  mocks.conceptCount.mockClear();
  mocks.conceptUpdate.mockClear();
  mocks.conceptUpdateMany.mockClear();
  mocks.studyPlanFindUnique.mockClear();
  mocks.enqueueJob.mockClear();
});

// ─── cosineSimilarity ───────────────────────────────────────────────────

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 6);
  });

  it('returns 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 6);
  });

  it('returns -1 for opposite vectors', () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1, 6);
  });

  it('returns 0 for a zero vector on either side (never NaN)', () => {
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
    expect(cosineSimilarity([1, 2, 3], [0, 0, 0])).toBe(0);
    expect(cosineSimilarity([0, 0], [0, 0])).toBe(0);
  });

  it('returns 0 for mismatched lengths (defensive)', () => {
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
  });

  it('computes a known non-trivial value', () => {
    // a=[1,1,0], b=[1,0,0] -> dot=1, |a|=sqrt(2), |b|=1 -> 1/sqrt(2)
    expect(cosineSimilarity([1, 1, 0], [1, 0, 0])).toBeCloseTo(1 / Math.sqrt(2), 6);
  });
});

// ─── runConceptDedup ────────────────────────────────────────────────────

describe('runConceptDedup', () => {
  it('is a no-op when the flag is off', async () => {
    mocks.weaknessConceptDedupEnabled.mockReturnValue(false);
    mocks.state.concepts = [makeConcept({ id: 'c1' })];

    await runConceptDedup('c1');

    expect(mocks.conceptFindUnique).not.toHaveBeenCalled();
  });

  it('skips a concept that already has a canonicalId set', async () => {
    mocks.state.concepts = [makeConcept({ id: 'c1', canonicalId: 'canon-existing' })];

    await runConceptDedup('c1');

    expect(mocks.embedContent).not.toHaveBeenCalled();
    expect(mocks.conceptUpdateMany).not.toHaveBeenCalled();
  });

  it('merges at cosine similarity >= 0.92: sets canonicalId/mergedAt/mergedLabelSnapshot via conditional update', async () => {
    const existing = makeConcept({
      id: 'existing-1',
      label: 'Present tense -ar verbs',
      embedding: [1, 0, 0],
      embeddedAt: new Date('2026-01-01T00:00:00Z'),
    });
    const fresh = makeConcept({
      id: 'fresh-1',
      label: 'Present tense -ar verb conjugation',
      embedding: [],
      embeddedAt: null,
      createdAt: new Date('2026-01-02T00:00:00Z'),
    });
    mocks.state.concepts = [existing, fresh];
    // Fresh concept embeds to the same vector as `existing` -> similarity 1.0
    mocks.embedContent.mockResolvedValue({ embeddings: [{ values: [1, 0, 0] }] });

    await runConceptDedup('fresh-1');

    expect(mocks.embedContent).toHaveBeenCalledTimes(1);

    const updated = mocks.state.concepts.find((c) => c.id === 'fresh-1')!;
    expect(updated.canonicalId).toBe('existing-1');
    expect(updated.mergedLabelSnapshot).toBe('Present tense -ar verbs');
    expect(updated.mergedAt).toBeInstanceOf(Date);
    // Embedding itself was persisted too.
    expect(updated.embedding).toEqual([1, 0, 0]);
    expect(updated.embeddedAt).toBeInstanceOf(Date);
  });

  it('resolves canonicalId through an already-merged candidate (chains to true canonical, never mid-chain)', async () => {
    const trueCanonical = makeConcept({
      id: 'canon-1',
      label: 'Root concept',
      embedding: [1, 0, 0],
      embeddedAt: new Date('2026-01-01T00:00:00Z'),
    });
    const midChain = makeConcept({
      id: 'mid-1',
      label: 'Mid concept',
      canonicalId: 'canon-1',
      embedding: [1, 0, 0],
      embeddedAt: new Date('2026-01-01T00:00:00Z'),
    });
    const fresh = makeConcept({ id: 'fresh-1', label: 'New concept', createdAt: new Date('2026-01-03') });
    // Candidate pool excludes already-merged rows by construction
    // (`canonicalId: null` filter) — only `trueCanonical` should be
    // eligible even though `midChain` also has a matching embedding.
    mocks.state.concepts = [trueCanonical, midChain, fresh];
    mocks.embedContent.mockResolvedValue({ embeddings: [{ values: [1, 0, 0] }] });

    await runConceptDedup('fresh-1');

    const updated = mocks.state.concepts.find((c) => c.id === 'fresh-1')!;
    expect(updated.canonicalId).toBe('canon-1');
  });

  it('logs a suggestion (not applied) for a candidate scoring between 0.80 and 0.92', async () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    // Construct two vectors with cosine similarity ~0.85.
    const a = [1, 0, 0];
    // cos(theta) = 0.85 -> theta ~ 31.79 deg
    const theta = Math.acos(0.85);
    const b = [Math.cos(theta), Math.sin(theta), 0];

    const existing = makeConcept({
      id: 'existing-1',
      label: 'Something related',
      embedding: a,
      embeddedAt: new Date('2026-01-01T00:00:00Z'),
    });
    const fresh = makeConcept({ id: 'fresh-1', label: 'Something else', createdAt: new Date('2026-01-02') });
    mocks.state.concepts = [existing, fresh];
    mocks.embedContent.mockResolvedValue({ embeddings: [{ values: b }] });

    await runConceptDedup('fresh-1');

    const updated = mocks.state.concepts.find((c) => c.id === 'fresh-1')!;
    expect(updated.canonicalId).toBeNull();

    const suggestedCall = infoSpy.mock.calls.find((call) => call[0] === '[concept-dedup] suggested, not applied');
    expect(suggestedCall).toBeTruthy();

    infoSpy.mockRestore();
  });

  it('does not merge below the suggest threshold', async () => {
    const existing = makeConcept({
      id: 'existing-1',
      label: 'Totally unrelated',
      embedding: [0, 1, 0],
      embeddedAt: new Date('2026-01-01T00:00:00Z'),
    });
    const fresh = makeConcept({ id: 'fresh-1', label: 'Something else', createdAt: new Date('2026-01-02') });
    mocks.state.concepts = [existing, fresh];
    mocks.embedContent.mockResolvedValue({ embeddings: [{ values: [1, 0, 0] }] }); // orthogonal -> sim 0

    await runConceptDedup('fresh-1');

    const updated = mocks.state.concepts.find((c) => c.id === 'fresh-1')!;
    expect(updated.canonicalId).toBeNull();
  });

  it('never throws when the embedding call fails', async () => {
    mocks.state.concepts = [makeConcept({ id: 'fresh-1' })];
    mocks.embedContent.mockRejectedValue(new Error('network down'));

    await expect(runConceptDedup('fresh-1')).resolves.toBeUndefined();
    expect(mocks.conceptUpdateMany).not.toHaveBeenCalled();
  });

  it('never throws for a nonexistent conceptId', async () => {
    await expect(runConceptDedup('does-not-exist')).resolves.toBeUndefined();
  });
});

// ─── runConceptDedupBackfill ────────────────────────────────────────────

describe('runConceptDedupBackfill', () => {
  it('is a no-op when the flag is off', async () => {
    mocks.weaknessConceptDedupEnabled.mockReturnValue(false);
    mocks.state.concepts = [makeConcept({ id: 'c1' })];

    await runConceptDedupBackfill(USER_ID);

    expect(mocks.conceptFindMany).not.toHaveBeenCalled();
  });

  it('processes only embedding-less rows (embeddedAt: null)', async () => {
    const alreadyEmbedded = makeConcept({
      id: 'c1',
      embedding: [1, 0, 0],
      embeddedAt: new Date('2026-01-01'),
    });
    const needsEmbedding = makeConcept({ id: 'c2', createdAt: new Date('2026-01-02') });
    mocks.state.concepts = [alreadyEmbedded, needsEmbedding];
    mocks.embedContent.mockResolvedValue({ embeddings: [{ values: [0, 1, 0] }] });

    await runConceptDedupBackfill(USER_ID);

    expect(mocks.embedContent).toHaveBeenCalledTimes(1);
    const updated = mocks.state.concepts.find((c) => c.id === 'c2')!;
    expect(updated.embedding).toEqual([0, 1, 0]);
    expect(updated.embeddedAt).toBeInstanceOf(Date);
  });

  it('resume semantics: a second run skips already-embedded rows from the first run', async () => {
    const row1 = makeConcept({ id: 'c1', createdAt: new Date('2026-01-01') });
    const row2 = makeConcept({ id: 'c2', createdAt: new Date('2026-01-02') });
    mocks.state.concepts = [row1, row2];
    mocks.embedContent.mockResolvedValue({ embeddings: [{ values: [1, 0, 0] }] });

    await runConceptDedupBackfill(USER_ID);
    expect(mocks.embedContent).toHaveBeenCalledTimes(2);

    mocks.embedContent.mockClear();
    // Second run: both rows now have embeddedAt set, so nothing left to process.
    await runConceptDedupBackfill(USER_ID);
    expect(mocks.embedContent).not.toHaveBeenCalled();
  });

  it('stops at the per-run cap', async () => {
    // Cap is 500 — verify the query passes take:500 by seeding more than the
    // cap would allow and asserting no more than the cap's worth of calls
    // fire. A full 501-row fixture is unnecessary; the loader passes `take`
    // to the mocked findMany which already applies it, so this just proves
    // the wiring is exercised.
    const rows = Array.from({ length: 5 }, (_, i) =>
      makeConcept({ id: `c${i}`, createdAt: new Date(2026, 0, i + 1) })
    );
    mocks.state.concepts = rows;
    mocks.embedContent.mockResolvedValue({ embeddings: [{ values: [1, 0, 0] }] });

    await runConceptDedupBackfill(USER_ID);

    expect(mocks.embedContent).toHaveBeenCalledTimes(5);
    expect(mocks.conceptFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 500 })
    );
  });

  it('never throws when an embedding call fails mid-run', async () => {
    const row1 = makeConcept({ id: 'c1', createdAt: new Date('2026-01-01') });
    const row2 = makeConcept({ id: 'c2', createdAt: new Date('2026-01-02') });
    mocks.state.concepts = [row1, row2];
    mocks.embedContent
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce({ embeddings: [{ values: [1, 0, 0] }] });

    await expect(runConceptDedupBackfill(USER_ID)).resolves.toBeUndefined();
    // Row 1 failed and stays unembedded; row 2 succeeded.
    expect(mocks.state.concepts.find((c) => c.id === 'c1')!.embeddedAt).toBeNull();
    expect(mocks.state.concepts.find((c) => c.id === 'c2')!.embeddedAt).toBeInstanceOf(Date);
  });
});

// ─── enqueueConceptDedupForPlan ─────────────────────────────────────────

describe('enqueueConceptDedupForPlan', () => {
  it('is a no-op when the flag is off', async () => {
    mocks.weaknessConceptDedupEnabled.mockReturnValue(false);
    await enqueueConceptDedupForPlan(PLAN_ID);
    expect(mocks.enqueueJob).not.toHaveBeenCalled();
  });

  it('enqueues concept.dedup only for unmatched, unembedded concepts on the plan', async () => {
    mocks.state.concepts = [
      makeConcept({ id: 'c1', canonicalId: null, embeddedAt: null }),
      makeConcept({ id: 'c2', canonicalId: 'canon-x', embeddedAt: null }),
      makeConcept({ id: 'c3', canonicalId: null, embeddedAt: new Date() }),
    ];

    await enqueueConceptDedupForPlan(PLAN_ID);

    expect(mocks.enqueueJob).toHaveBeenCalledTimes(1);
    expect(mocks.enqueueJob).toHaveBeenCalledWith(
      'concept.dedup',
      { conceptId: 'c1' },
      { dedupeKey: 'concept.dedup:c1' }
    );
  });

  it('never throws on a DB failure', async () => {
    mocks.conceptFindMany.mockRejectedValueOnce(new Error('db down'));
    await expect(enqueueConceptDedupForPlan(PLAN_ID)).resolves.toBeUndefined();
  });
});

// ─── maybeEnqueueDedupBackfill ──────────────────────────────────────────

describe('maybeEnqueueDedupBackfill', () => {
  it('is a no-op when the flag is off', async () => {
    mocks.weaknessConceptDedupEnabled.mockReturnValue(false);
    await maybeEnqueueDedupBackfill(USER_ID);
    expect(mocks.enqueueJob).not.toHaveBeenCalled();
  });

  it('does not enqueue when fewer than 2 unembedded canonical concepts exist', async () => {
    mocks.state.concepts = [makeConcept({ id: 'c1', embeddedAt: null })];
    await maybeEnqueueDedupBackfill(USER_ID);
    expect(mocks.enqueueJob).not.toHaveBeenCalled();
  });

  it('enqueues with a 24h-bucketed dedupeKey, runAt now, maxAttempts 1 when >= 2 unembedded concepts exist', async () => {
    mocks.state.concepts = [
      makeConcept({ id: 'c1', embeddedAt: null }),
      makeConcept({ id: 'c2', embeddedAt: null }),
    ];

    await maybeEnqueueDedupBackfill(USER_ID);

    expect(mocks.enqueueJob).toHaveBeenCalledTimes(1);
    const [kind, payload, options] = mocks.enqueueJob.mock.calls[0];
    expect(kind).toBe('concept.dedup.backfill');
    expect(payload).toEqual({ userId: USER_ID });
    expect(options?.maxAttempts).toBe(1);
    expect(options?.runAt).toBeInstanceOf(Date);
    const today = new Date().toISOString().slice(0, 10);
    expect(options?.dedupeKey).toBe(`concept.dedup.backfill:${USER_ID}:${today}`);
  });

  it('never throws on a DB failure', async () => {
    mocks.conceptCount.mockRejectedValueOnce(new Error('db down'));
    await expect(maybeEnqueueDedupBackfill(USER_ID)).resolves.toBeUndefined();
  });
});

// Sanity check for the exported threshold constant used above.
describe('COSINE_MATCH_THRESHOLD', () => {
  it('is 0.92 per plan §11.4', () => {
    expect(COSINE_MATCH_THRESHOLD).toBe(0.92);
  });
});
