import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── mocks ──────────────────────────────────────────────────────────────
//
// `concept-edges.ts` talks only to the DB (`@/lib/db`) and `enqueueJob`
// (`@/lib/background-jobs`). This file mocks both with a tiny in-memory
// Prisma-shaped store (built inside `vi.hoisted` so the mock factory below
// can close over it) so `deriveStructuralEdgesForPlan`, `wouldCreateCycle`,
// and `upsertConceptEdge` can be exercised as pure units against fixture
// graphs, mirroring the mock-db idiom in `concept-backfill.test.ts` /
// `concept-misconception-tag.test.ts`.

interface SlotFixture {
  id: string;
  phaseId: string;
  planId: string;
  sortOrder: number;
  kind: string;
  coversSlotIds: string[];
}

interface ConceptFixture {
  id: string;
  planId: string;
  slotId: string;
}

interface EdgeFixture {
  planId: string;
  fromConceptId: string;
  toConceptId: string;
  source: string;
  confidence: number;
}

const mocks = vi.hoisted(() => {
  const state = {
    slots: [] as SlotFixture[],
    concepts: [] as ConceptFixture[],
    edges: [] as EdgeFixture[],
  };

  const checkpointSlotFindMany = vi.fn(async ({ where }: { where: { phase: { planId: string } } }) =>
    state.slots.filter((s) => s.planId === where.phase.planId)
  );

  const conceptFindMany = vi.fn(async ({ where }: { where: { planId: string } }) =>
    state.concepts.filter((c) => c.planId === where.planId)
  );

  const conceptFindUnique = vi.fn(async ({ where }: { where: { id: string } }) => {
    const concept = state.concepts.find((c) => c.id === where.id);
    return concept ? { planId: concept.planId } : null;
  });

  const conceptCount = vi.fn(async ({ where }: { where: { planId: string } }) =>
    state.concepts.filter((c) => c.planId === where.planId).length
  );

  const conceptEdgeFindMany = vi.fn(
    async ({ where }: { where: { planId: string; fromConceptId: { in: string[] } } }) =>
      state.edges
        .filter((e) => e.planId === where.planId && where.fromConceptId.in.includes(e.fromConceptId))
        .map((e) => ({ toConceptId: e.toConceptId }))
  );

  const conceptEdgeFindUnique = vi.fn(
    async ({
      where,
    }: {
      where: { fromConceptId_toConceptId: { fromConceptId: string; toConceptId: string } };
    }) => {
      const { fromConceptId, toConceptId } = where.fromConceptId_toConceptId;
      const edge = state.edges.find((e) => e.fromConceptId === fromConceptId && e.toConceptId === toConceptId);
      return edge ? { source: edge.source } : null;
    }
  );

  const conceptEdgeUpsert = vi.fn(
    async ({
      where,
      update,
      create,
    }: {
      where: { fromConceptId_toConceptId: { fromConceptId: string; toConceptId: string } };
      update: { source: string; confidence: number; planId: string };
      create: EdgeFixture;
    }) => {
      const { fromConceptId, toConceptId } = where.fromConceptId_toConceptId;
      const existing = state.edges.find((e) => e.fromConceptId === fromConceptId && e.toConceptId === toConceptId);
      if (existing) {
        existing.source = update.source;
        existing.confidence = update.confidence;
        existing.planId = update.planId;
        return existing;
      }
      state.edges.push({ ...create });
      return create;
    }
  );

  const enqueueJob = vi.fn();

  return {
    state,
    checkpointSlotFindMany,
    conceptFindMany,
    conceptFindUnique,
    conceptCount,
    conceptEdgeFindMany,
    conceptEdgeFindUnique,
    conceptEdgeUpsert,
    enqueueJob,
  };
});

vi.mock('@/lib/background-jobs', () => ({
  enqueueJob: mocks.enqueueJob,
}));

vi.mock('@/lib/db', () => ({
  db: {
    checkpointSlot: { findMany: mocks.checkpointSlotFindMany },
    concept: {
      findMany: mocks.conceptFindMany,
      findUnique: mocks.conceptFindUnique,
      count: mocks.conceptCount,
    },
    conceptEdge: {
      findMany: mocks.conceptEdgeFindMany,
      findUnique: mocks.conceptEdgeFindUnique,
      upsert: mocks.conceptEdgeUpsert,
    },
  },
}));

import {
  CONFIDENCE_STRUCTURAL_COVERS_SLOT,
  CONFIDENCE_STRUCTURAL_PHASE_ORDER,
  deriveStructuralEdgesForPlan,
  SOURCE_PRIORITY,
  upsertConceptEdge,
  wouldCreateCycle,
} from './concept-edges';

// ─── fixtures ───────────────────────────────────────────────────────────

const PLAN_ID = 'plan-1';
const PHASE_1 = 'phase-1';
const PHASE_2 = 'phase-2';

function addSlot(slot: Omit<SlotFixture, 'planId'>, planId = PLAN_ID) {
  mocks.state.slots.push({ ...slot, planId });
}

function addConcept(concept: ConceptFixture) {
  mocks.state.concepts.push(concept);
}

beforeEach(() => {
  mocks.state.slots = [];
  mocks.state.concepts = [];
  mocks.state.edges = [];
  vi.clearAllMocks();
});

// ─── deriveStructuralEdgesForPlan ────────────────────────────────────────

describe('deriveStructuralEdgesForPlan', () => {
  it('links a chain A -> B -> C across three learning slots in one phase', async () => {
    addSlot({ id: 's1', phaseId: PHASE_1, sortOrder: 0, kind: 'learning', coversSlotIds: [] });
    addSlot({ id: 's2', phaseId: PHASE_1, sortOrder: 1, kind: 'learning', coversSlotIds: [] });
    addSlot({ id: 's3', phaseId: PHASE_1, sortOrder: 2, kind: 'learning', coversSlotIds: [] });
    addConcept({ id: 'A', planId: PLAN_ID, slotId: 's1' });
    addConcept({ id: 'B', planId: PLAN_ID, slotId: 's2' });
    addConcept({ id: 'C', planId: PLAN_ID, slotId: 's3' });

    await deriveStructuralEdgesForPlan(PLAN_ID);

    expect(mocks.state.edges).toHaveLength(2);
    expect(mocks.state.edges).toContainEqual(
      expect.objectContaining({ fromConceptId: 'A', toConceptId: 'B', source: 'structural_phase_order' })
    );
    expect(mocks.state.edges).toContainEqual(
      expect.objectContaining({ fromConceptId: 'B', toConceptId: 'C', source: 'structural_phase_order' })
    );
  });

  it('produces a diamond (4 edges) with no false cycle rejection', async () => {
    // s1 (A) -> s2 (B) -> s4 (D)
    //        \-> s3 (C) ->/     (s4 covers both s2 and s3)
    addSlot({ id: 's1', phaseId: PHASE_1, sortOrder: 0, kind: 'learning', coversSlotIds: [] });
    addSlot({ id: 's2', phaseId: PHASE_1, sortOrder: 1, kind: 'learning', coversSlotIds: [] });
    addSlot({ id: 's3', phaseId: PHASE_1, sortOrder: 2, kind: 'learning', coversSlotIds: [] });
    addSlot({ id: 's4', phaseId: PHASE_1, sortOrder: 3, kind: 'assessment', coversSlotIds: ['s2', 's3'] });
    addConcept({ id: 'A', planId: PLAN_ID, slotId: 's1' });
    addConcept({ id: 'B', planId: PLAN_ID, slotId: 's2' });
    addConcept({ id: 'C', planId: PLAN_ID, slotId: 's3' });
    addConcept({ id: 'D', planId: PLAN_ID, slotId: 's4' });

    await deriveStructuralEdgesForPlan(PLAN_ID);

    const pairs = mocks.state.edges.map((e) => [e.fromConceptId, e.toConceptId, e.source]);
    expect(pairs).toContainEqual(['A', 'B', 'structural_phase_order']);
    expect(pairs).toContainEqual(['B', 'C', 'structural_phase_order']);
    expect(pairs).toContainEqual(['B', 'D', 'structural_covers_slot']);
    expect(pairs).toContainEqual(['C', 'D', 'structural_covers_slot']);
    expect(mocks.state.edges).toHaveLength(4);
  });

  it('rejects an attempted cycle A -> B -> A without throwing, and logs it', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    addSlot({ id: 's1', phaseId: PHASE_1, sortOrder: 0, kind: 'learning', coversSlotIds: [] });
    addSlot({ id: 's2', phaseId: PHASE_1, sortOrder: 1, kind: 'learning', coversSlotIds: [] });
    addConcept({ id: 'A', planId: PLAN_ID, slotId: 's1' });
    addConcept({ id: 'B', planId: PLAN_ID, slotId: 's2' });

    // Legitimate structural edge first.
    await deriveStructuralEdgesForPlan(PLAN_ID);
    expect(mocks.state.edges).toHaveLength(1);

    // Now attempt the reverse edge directly (would close a cycle).
    await expect(
      upsertConceptEdge({
        planId: PLAN_ID,
        fromConceptId: 'B',
        toConceptId: 'A',
        source: 'structural_phase_order',
        confidence: CONFIDENCE_STRUCTURAL_PHASE_ORDER,
      })
    ).resolves.toBeUndefined();

    expect(mocks.state.edges).toHaveLength(1); // still just A->B
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('would create cycle'),
      expect.objectContaining({ fromConceptId: 'B', toConceptId: 'A' })
    );
    warnSpy.mockRestore();
  });

  it('never links concepts across a phase boundary', async () => {
    addSlot({ id: 's1', phaseId: PHASE_1, sortOrder: 0, kind: 'learning', coversSlotIds: [] });
    addSlot({ id: 's2', phaseId: PHASE_2, sortOrder: 0, kind: 'learning', coversSlotIds: [] });
    addConcept({ id: 'A', planId: PLAN_ID, slotId: 's1' });
    addConcept({ id: 'B', planId: PLAN_ID, slotId: 's2' });

    await deriveStructuralEdgesForPlan(PLAN_ID);

    expect(mocks.state.edges).toHaveLength(0);
  });

  it('covers-slot edges point at covered slots specifically and win over phase-order per SOURCE_PRIORITY', async () => {
    // s1 (A, learning) -> s2 (B, learning) -> s3 (C, assessment covering s1 only)
    // Immediately-preceding adjacency would give B->C as structural_phase_order,
    // but s3.coversSlotIds = [s1], so A->C must be structural_covers_slot.
    addSlot({ id: 's1', phaseId: PHASE_1, sortOrder: 0, kind: 'learning', coversSlotIds: [] });
    addSlot({ id: 's2', phaseId: PHASE_1, sortOrder: 1, kind: 'learning', coversSlotIds: [] });
    addSlot({ id: 's3', phaseId: PHASE_1, sortOrder: 2, kind: 'assessment', coversSlotIds: ['s1'] });
    addConcept({ id: 'A', planId: PLAN_ID, slotId: 's1' });
    addConcept({ id: 'B', planId: PLAN_ID, slotId: 's2' });
    addConcept({ id: 'C', planId: PLAN_ID, slotId: 's3' });

    await deriveStructuralEdgesForPlan(PLAN_ID);

    const acEdge = mocks.state.edges.find((e) => e.fromConceptId === 'A' && e.toConceptId === 'C');
    expect(acEdge?.source).toBe('structural_covers_slot');
    expect(acEdge?.confidence).toBe(CONFIDENCE_STRUCTURAL_COVERS_SLOT);

    const bcEdge = mocks.state.edges.find((e) => e.fromConceptId === 'B' && e.toConceptId === 'C');
    expect(bcEdge?.source).toBe('structural_phase_order');

    expect(SOURCE_PRIORITY.structural_covers_slot).toBeGreaterThan(SOURCE_PRIORITY.structural_phase_order);

    // Re-derive with a downgrade attempt: a direct structural_phase_order
    // upsert onto the A->C pair must not clobber the existing stronger edge.
    await upsertConceptEdge({
      planId: PLAN_ID,
      fromConceptId: 'A',
      toConceptId: 'C',
      source: 'structural_phase_order',
      confidence: CONFIDENCE_STRUCTURAL_PHASE_ORDER,
    });
    const acEdgeAfter = mocks.state.edges.find((e) => e.fromConceptId === 'A' && e.toConceptId === 'C');
    expect(acEdgeAfter?.source).toBe('structural_covers_slot');
  });

  it('is idempotent — re-running produces no additional edges (upsert no-op)', async () => {
    addSlot({ id: 's1', phaseId: PHASE_1, sortOrder: 0, kind: 'learning', coversSlotIds: [] });
    addSlot({ id: 's2', phaseId: PHASE_1, sortOrder: 1, kind: 'learning', coversSlotIds: [] });
    addConcept({ id: 'A', planId: PLAN_ID, slotId: 's1' });
    addConcept({ id: 'B', planId: PLAN_ID, slotId: 's2' });

    await deriveStructuralEdgesForPlan(PLAN_ID);
    expect(mocks.state.edges).toHaveLength(1);

    await deriveStructuralEdgesForPlan(PLAN_ID);
    expect(mocks.state.edges).toHaveLength(1);
  });

  it('skips a self-edge without creating a row', async () => {
    addSlot({ id: 's1', phaseId: PHASE_1, sortOrder: 0, kind: 'learning', coversSlotIds: [] });
    addConcept({ id: 'A', planId: PLAN_ID, slotId: 's1' });

    await upsertConceptEdge({
      planId: PLAN_ID,
      fromConceptId: 'A',
      toConceptId: 'A',
      source: 'structural_phase_order',
      confidence: CONFIDENCE_STRUCTURAL_PHASE_ORDER,
    });

    expect(mocks.state.edges).toHaveLength(0);
  });
});

// ─── wouldCreateCycle ────────────────────────────────────────────────────

describe('wouldCreateCycle', () => {
  it('detects a direct reverse edge as a cycle', async () => {
    mocks.state.edges.push({ planId: PLAN_ID, fromConceptId: 'A', toConceptId: 'B', source: 'structural_phase_order', confidence: 0.35 });
    await expect(wouldCreateCycle('B', 'A', PLAN_ID)).resolves.toBe(true);
  });

  it('returns false for an unrelated pair', async () => {
    mocks.state.edges.push({ planId: PLAN_ID, fromConceptId: 'A', toConceptId: 'B', source: 'structural_phase_order', confidence: 0.35 });
    await expect(wouldCreateCycle('C', 'D', PLAN_ID)).resolves.toBe(false);
  });

  it('treats a self-pair as a cycle', async () => {
    await expect(wouldCreateCycle('A', 'A', PLAN_ID)).resolves.toBe(true);
  });
});
