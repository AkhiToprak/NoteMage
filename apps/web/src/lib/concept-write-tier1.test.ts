import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── mocks ──────────────────────────────────────────────────────────────
//
// Separate test file (not `concept-write.test.ts`) so tier-1 dedup coverage
// for `persistSlotConcepts` doesn't collide with that file's
// `recordConceptAttempt` coverage. Same `vi.mock('@/lib/db', ...)` idiom.

const mocks = vi.hoisted(() => ({
  conceptFindUnique: vi.fn(),
  conceptFindMany: vi.fn(),
  conceptUpsert: vi.fn(),
  studyPlanFindUnique: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    concept: {
      findUnique: mocks.conceptFindUnique,
      findMany: mocks.conceptFindMany,
      upsert: mocks.conceptUpsert,
    },
    studyPlan: {
      findUnique: mocks.studyPlanFindUnique,
    },
  },
}));

import { persistSlotConcepts } from './concept-write';

// ─── fixtures ───────────────────────────────────────────────────────────

const PLAN_ID = 'plan-new';
const SLOT_ID = 'slot-new';
const USER_ID = 'user-1';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.studyPlanFindUnique.mockResolvedValue({ userId: USER_ID });
  // Default: no existing (slotId, key) row -> every label is a "new" upsert
  // create path, so tier-1 lookup always runs.
  mocks.conceptFindUnique.mockResolvedValue(null);
  mocks.conceptUpsert.mockImplementation(async ({ create }: { create: { key: string } }) => ({
    id: `concept-${create.key}`,
  }));
});

describe('persistSlotConcepts — tier-1 lexical dedup', () => {
  it('creates a genuinely new canonical concept when no existing concept matches', async () => {
    mocks.conceptFindMany.mockResolvedValue([]);

    const byKey = await persistSlotConcepts(PLAN_ID, SLOT_ID, ['Subjunctive mood triggers']);

    expect(mocks.conceptUpsert).toHaveBeenCalledTimes(1);
    const [[callArg]] = mocks.conceptUpsert.mock.calls;
    expect(callArg.create.canonicalId).toBeUndefined();
    expect(callArg.create.mergedAt).toBeUndefined();
    expect(byKey.get('Subjunctive mood triggers')).toBeDefined();
  });

  it('sets canonicalId/mergedAt/mergedLabelSnapshot on an exact-slug match against the user\'s other concepts', async () => {
    mocks.conceptFindMany.mockResolvedValue([
      { id: 'concept-existing', key: 'regular-ar-verbs', label: 'Regular -ar verbs', canonicalId: null },
    ]);

    await persistSlotConcepts(PLAN_ID, SLOT_ID, ['Regular -ar verbs']);

    expect(mocks.conceptUpsert).toHaveBeenCalledTimes(1);
    const [[callArg]] = mocks.conceptUpsert.mock.calls;
    expect(callArg.create.canonicalId).toBe('concept-existing');
    expect(callArg.create.mergedLabelSnapshot).toBe('Regular -ar verbs');
    expect(callArg.create.mergedAt).toBeInstanceOf(Date);
  });

  it('sets canonicalId on a Jaccard >= 0.8 match with a differently-worded label', async () => {
    mocks.conceptFindMany.mockResolvedValue([
      { id: 'concept-existing', key: 'regular-ar-present-tense', label: 'Regular -ar present tense', canonicalId: null },
    ]);

    await persistSlotConcepts(PLAN_ID, SLOT_ID, ['Regular -ar present-tense verbs']);

    const [[callArg]] = mocks.conceptUpsert.mock.calls;
    expect(callArg.create.canonicalId).toBe('concept-existing');
    expect(callArg.create.mergedLabelSnapshot).toBe('Regular -ar present tense');
  });

  it('never runs a tier-1 lookup (and never sets canonicalId) for a label that already exists in this slot', async () => {
    mocks.conceptFindUnique.mockResolvedValue({ id: 'concept-already' });

    await persistSlotConcepts(PLAN_ID, SLOT_ID, ['Existing label']);

    expect(mocks.conceptFindMany).not.toHaveBeenCalled();
    const [[callArg]] = mocks.conceptUpsert.mock.calls;
    expect(callArg.create.canonicalId).toBeUndefined();
  });

  it('scopes the candidate pool to canonicalId: null and this concept\'s owning plan\'s userId', async () => {
    mocks.conceptFindMany.mockResolvedValue([]);

    await persistSlotConcepts(PLAN_ID, SLOT_ID, ['Some label']);

    expect(mocks.studyPlanFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: PLAN_ID } })
    );
    expect(mocks.conceptFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { canonicalId: null, plan: { userId: USER_ID } },
      })
    );
  });

  it('is best-effort: a tier-1 lookup failure never blocks concept creation', async () => {
    mocks.studyPlanFindUnique.mockRejectedValueOnce(new Error('db down'));

    const byKey = await persistSlotConcepts(PLAN_ID, SLOT_ID, ['Some label']);

    expect(byKey.get('Some label')).toBeDefined();
    const [[callArg]] = mocks.conceptUpsert.mock.calls;
    expect(callArg.create.canonicalId).toBeUndefined();
  });

  it('never creates a self-referencing canonicalId (brand-new row cannot match itself — candidate pool is queried before creation)', async () => {
    // The pool returned here is entirely disjoint from the label being
    // created, simulating that the new row doesn't exist yet at query time.
    mocks.conceptFindMany.mockResolvedValue([
      { id: 'concept-other', key: 'unrelated-topic', label: 'Unrelated topic', canonicalId: null },
    ]);

    await persistSlotConcepts(PLAN_ID, SLOT_ID, ['Brand new topic']);

    const [[callArg]] = mocks.conceptUpsert.mock.calls;
    expect(callArg.create.canonicalId).toBeUndefined();
  });
});
