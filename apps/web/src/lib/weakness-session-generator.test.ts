import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── mocks ──────────────────────────────────────────────────────────────
//
// `weakness-session-generator.ts`'s selection logic (`pickSessionConcepts`,
// `findWeakPrerequisite`) talks only to `./db` (Prisma) — mocked here with a
// tiny in-memory store, following the `vi.mock('@/lib/db', ...)` idiom used
// in `concept-edges.test.ts` / `concept-weak-areas-loader.test.ts`. Only the
// Prisma calls this file's selection logic actually makes are stubbed
// (`concept.findUnique`/`findMany`, `conceptMastery.findMany`,
// `conceptEdge.findMany`) — the AI-generation half of the module
// (`generateWeaknessSession` etc.) is exercised elsewhere / not under test
// here.

interface ConceptFixture {
  id: string;
  canonicalId: string | null;
  label: string;
  description: string | null;
  planId: string;
  slotId: string;
}

interface MasteryFixture {
  conceptId: string;
  weightedCorrect: number;
  weightedTotal: number;
  attemptCount: number;
  lastAttemptAt: Date | null;
  lastCorrectAt: Date | null;
  peakLcb: number;
  status: string;
}

interface EdgeFixture {
  fromConceptId: string;
  toConceptId: string;
  confidence: number;
}

const mocks = vi.hoisted(() => {
  const state = {
    concepts: [] as ConceptFixture[],
    mastery: [] as MasteryFixture[],
    edges: [] as EdgeFixture[],
  };

  const conceptFindUnique = vi.fn(async ({ where }: { where: { id: string } }) => {
    const c = state.concepts.find((x) => x.id === where.id);
    return c ? { id: c.id, canonicalId: c.canonicalId } : null;
  });

  const conceptFindMany = vi.fn(
    async ({
      where,
    }: {
      where: { id?: { in: string[] } | string; canonicalId?: string; OR?: { id?: string; canonicalId?: string }[] };
    }) => {
      let results = state.concepts;
      if (where.OR) {
        const ids = new Set<string>();
        for (const clause of where.OR) {
          if (clause.id) ids.add(clause.id);
          if (clause.canonicalId) {
            for (const c of state.concepts) if (c.canonicalId === clause.canonicalId) ids.add(c.id);
          }
        }
        results = state.concepts.filter((c) => ids.has(c.id));
      } else if (where.id && typeof where.id === 'object' && 'in' in where.id) {
        const idSet = new Set(where.id.in);
        results = state.concepts.filter((c) => idSet.has(c.id));
      }
      return results.map((c) => ({
        id: c.id,
        canonicalId: c.canonicalId,
        label: c.label,
        description: c.description,
        planId: c.planId,
        slotId: c.slotId,
      }));
    }
  );

  const conceptMasteryFindMany = vi.fn(
    async ({ where }: { where: { userId: string; conceptId?: { in: string[] } } }) => {
      let rows = state.mastery;
      if (where.conceptId) {
        const idSet = new Set(where.conceptId.in);
        rows = rows.filter((m) => idSet.has(m.conceptId));
      }
      return rows.map((m) => {
        const concept = state.concepts.find((c) => c.id === m.conceptId);
        return {
          conceptId: m.conceptId,
          weightedCorrect: m.weightedCorrect,
          weightedTotal: m.weightedTotal,
          attemptCount: m.attemptCount,
          lastAttemptAt: m.lastAttemptAt,
          lastCorrectAt: m.lastCorrectAt,
          peakLcb: m.peakLcb,
          status: m.status,
          concept: {
            id: concept?.id ?? m.conceptId,
            canonicalId: concept?.canonicalId ?? null,
            label: concept?.label ?? m.conceptId,
            mergedLabelSnapshot: null,
            planId: concept?.planId ?? 'plan-1',
            slotId: concept?.slotId ?? 'slot-1',
          },
        };
      });
    }
  );

  const conceptEdgeFindMany = vi.fn(
    async ({ where }: { where: { toConceptId: { in: string[] } } }) => {
      const idSet = new Set(where.toConceptId.in);
      return state.edges
        .filter((e) => idSet.has(e.toConceptId))
        .sort((a, b) => b.confidence - a.confidence)
        .map((e) => ({ fromConceptId: e.fromConceptId }));
    }
  );

  return {
    state,
    conceptFindUnique,
    conceptFindMany,
    conceptMasteryFindMany,
    conceptEdgeFindMany,
  };
});

vi.mock('./db', () => ({
  db: {
    concept: {
      findUnique: mocks.conceptFindUnique,
      findMany: mocks.conceptFindMany,
    },
    conceptMastery: {
      findMany: mocks.conceptMasteryFindMany,
    },
    conceptEdge: {
      findMany: mocks.conceptEdgeFindMany,
    },
  },
}));

import { findWeakPrerequisite, pickSessionConcepts } from './weakness-session-generator';

// ─── fixtures ───────────────────────────────────────────────────────────

const USER_ID = 'user-1';
const NOW = new Date('2026-07-01T12:00:00.000Z');
const RECENT = new Date('2026-06-30T12:00:00.000Z'); // 1 day before NOW — negligible decay

function addConcept(c: Partial<ConceptFixture> & { id: string }) {
  mocks.state.concepts.push({
    canonicalId: null,
    label: `Concept ${c.id}`,
    description: null,
    planId: 'plan-1',
    slotId: 'slot-1',
    ...c,
  });
}

/** A mastery row that re-decays to `weak` at NOW (lcb well below WEAK_BELOW_LCB=0.55,
 *  enough weightedTotal to clear UNTESTED_BELOW_TOTAL=2.5). */
function addWeakMastery(conceptId: string, overrides: Partial<MasteryFixture> = {}) {
  mocks.state.mastery.push({
    conceptId,
    weightedCorrect: 1,
    weightedTotal: 10,
    attemptCount: 10,
    lastAttemptAt: RECENT,
    lastCorrectAt: RECENT,
    peakLcb: 0.2,
    status: 'weak',
    ...overrides,
  });
}

/** A mastery row that re-decays to `solid` at NOW (lcb well above SOLID_AT_OR_ABOVE_LCB=0.75). */
function addSolidMastery(conceptId: string, overrides: Partial<MasteryFixture> = {}) {
  mocks.state.mastery.push({
    conceptId,
    weightedCorrect: 19,
    weightedTotal: 20,
    attemptCount: 20,
    lastAttemptAt: RECENT,
    lastCorrectAt: RECENT,
    peakLcb: 0.9,
    status: 'solid',
    ...overrides,
  });
}

function addEdge(fromConceptId: string, toConceptId: string, confidence: number) {
  mocks.state.edges.push({ fromConceptId, toConceptId, confidence });
}

beforeEach(() => {
  mocks.state.concepts = [];
  mocks.state.mastery = [];
  mocks.state.edges = [];
  vi.clearAllMocks();
});

// `cooldownConceptSet` already has dedicated regression coverage in
// `weakness-session-reuse.test.ts` (untouched by this workstream) — not
// duplicated here.

// ─── findWeakPrerequisite ────────────────────────────────────────────────

describe('findWeakPrerequisite', () => {
  it('returns the top weak prerequisite by confidence', () => {
    addConcept({ id: 'target' });
    addConcept({ id: 'prereq-low-conf' });
    addConcept({ id: 'prereq-high-conf' });
    addWeakMastery('prereq-low-conf');
    addWeakMastery('prereq-high-conf');
    addEdge('prereq-low-conf', 'target', 0.35);
    addEdge('prereq-high-conf', 'target', 0.7);

    return findWeakPrerequisite(USER_ID, 'target', NOW).then((result) => {
      expect(result).toEqual({ conceptId: 'prereq-high-conf', band: 'weak' });
    });
  });

  it('returns null (does not force-include) when the only prerequisite is solid', () => {
    addConcept({ id: 'target' });
    addConcept({ id: 'prereq-solid' });
    addSolidMastery('prereq-solid');
    addEdge('prereq-solid', 'target', 0.7);

    return findWeakPrerequisite(USER_ID, 'target', NOW).then((result) => {
      expect(result).toBeNull();
    });
  });

  it('treats a prerequisite with no mastery row at all as untested and includes it', () => {
    addConcept({ id: 'target' });
    addConcept({ id: 'prereq-untested' });
    // No mastery row added at all.
    addEdge('prereq-untested', 'target', 0.5);

    return findWeakPrerequisite(USER_ID, 'target', NOW).then((result) => {
      expect(result).toEqual({ conceptId: 'prereq-untested', band: 'untested' });
    });
  });

  it('skips a prerequisite already in alreadyPickedConceptIds and falls through to the next', () => {
    addConcept({ id: 'target' });
    addConcept({ id: 'prereq-high-conf' });
    addConcept({ id: 'prereq-low-conf' });
    addWeakMastery('prereq-high-conf');
    addWeakMastery('prereq-low-conf');
    addEdge('prereq-high-conf', 'target', 0.7);
    addEdge('prereq-low-conf', 'target', 0.35);

    return findWeakPrerequisite(USER_ID, 'target', NOW, new Set(['prereq-high-conf'])).then((result) => {
      expect(result).toEqual({ conceptId: 'prereq-low-conf', band: 'weak' });
    });
  });

  it('never returns the target itself even if a self-edge somehow exists', () => {
    addConcept({ id: 'target' });
    addWeakMastery('target');
    addEdge('target', 'target', 0.9);

    return findWeakPrerequisite(USER_ID, 'target', NOW).then((result) => {
      expect(result).toBeNull();
    });
  });

  it('returns null when the target has no inbound edges', () => {
    addConcept({ id: 'target' });
    return findWeakPrerequisite(USER_ID, 'target', NOW).then((result) => {
      expect(result).toBeNull();
    });
  });

  it('resolves an edge pointing at a merged-away from-concept to its canonical id', () => {
    // 'old-prereq' was merged into 'canonical-prereq'; the stored edge still
    // references the pre-merge id as fromConceptId (edges are never
    // rewritten at merge time, §12.5). Mastery evidence lives on the
    // canonical concept.
    addConcept({ id: 'target' });
    addConcept({ id: 'canonical-prereq', canonicalId: null });
    addConcept({ id: 'old-prereq', canonicalId: 'canonical-prereq' });
    addWeakMastery('canonical-prereq');
    addEdge('old-prereq', 'target', 0.6);

    return findWeakPrerequisite(USER_ID, 'target', NOW).then((result) => {
      expect(result).toEqual({ conceptId: 'canonical-prereq', band: 'weak' });
    });
  });

  it('resolves the target through its own canonicalId and still matches edges into the pre-merge id', () => {
    // The primary target concept passed in ('old-target') was itself merged
    // into 'canonical-target'. An edge stored against the OLD (pre-merge) id
    // must still be found via the merge-group widening.
    addConcept({ id: 'canonical-target', canonicalId: null });
    addConcept({ id: 'old-target', canonicalId: 'canonical-target' });
    addConcept({ id: 'prereq' });
    addWeakMastery('prereq');
    addEdge('prereq', 'old-target', 0.6);

    return findWeakPrerequisite(USER_ID, 'old-target', NOW).then((result) => {
      expect(result).toEqual({ conceptId: 'prereq', band: 'weak' });
    });
  });
});

// ─── pickSessionConcepts — Phase 4.2c wiring ────────────────────────────

describe('pickSessionConcepts — prerequisite wiring (4.2c)', () => {
  it('includes a weak prerequisite first in delivery order when a fill slot is free', async () => {
    // `prereq` must NOT be picked up by the GENERIC ranked-fill pass
    // (`deriveConceptWeakAreas` only ever surfaces `weak`/`rusty` bands into
    // `result.areas` — see concept-weak-areas.ts) so this test isolates the
    // prerequisite-preference path from the pre-existing generic-fill path.
    // An UNTESTED prerequisite (no ConceptMastery row at all) is exactly
    // that case: `findWeakPrerequisite` treats "no row" as `untested` and
    // includes it, but it can never appear in `rest`/`additional` since
    // `deriveConceptWeakAreas` drops non-weak/rusty bands entirely. If this
    // test instead used a WEAK `prereq`, it would already be swept into the
    // generic same-plan fill list ahead of the prerequisite step running,
    // making it impossible to tell which code path produced the ordering.
    addConcept({ id: 'primary', planId: 'plan-1' });
    addConcept({ id: 'prereq', planId: 'plan-1' });
    addWeakMastery('primary');
    // No mastery row for 'prereq' — untested, and therefore invisible to
    // deriveConceptWeakAreas' generic ranking but still fill-worthy here.
    addEdge('prereq', 'primary', 0.7);

    const targets = await pickSessionConcepts(USER_ID, 'primary', NOW);

    expect(targets.length).toBe(2);
    expect(targets[0].conceptId).toBe('prereq');
    expect(targets[0].isPrerequisite).toBe(true);
    expect(targets[1].conceptId).toBe('primary');
    expect(targets[1].isPrerequisite).toBeFalsy();
  });

  it('does NOT force-include a solid prerequisite — falls through to generic ranked fill', async () => {
    addConcept({ id: 'primary', planId: 'plan-1' });
    addConcept({ id: 'solid-prereq', planId: 'plan-1' });
    addConcept({ id: 'generic-fill', planId: 'plan-1' });
    addWeakMastery('primary');
    addSolidMastery('solid-prereq');
    addWeakMastery('generic-fill');
    addEdge('solid-prereq', 'primary', 0.7);

    const targets = await pickSessionConcepts(USER_ID, 'primary', NOW);

    const ids = targets.map((t) => t.conceptId);
    expect(ids).not.toContain('solid-prereq');
    expect(ids).toContain('generic-fill');
    expect(targets.every((t) => !t.isPrerequisite)).toBe(true);
  });

  it('includes an untested prerequisite (no mastery row) when a fill slot is free', async () => {
    addConcept({ id: 'primary', planId: 'plan-1' });
    addConcept({ id: 'untested-prereq', planId: 'plan-1' });
    addWeakMastery('primary');
    // No mastery row for 'untested-prereq' at all.
    addEdge('untested-prereq', 'primary', 0.5);

    const targets = await pickSessionConcepts(USER_ID, 'primary', NOW);

    expect(targets[0].conceptId).toBe('untested-prereq');
    expect(targets[0].isPrerequisite).toBe(true);
  });

  it('does not add the prerequisite (or bump anything) when the session is already full', async () => {
    addConcept({ id: 'primary', planId: 'plan-1' });
    addConcept({ id: 'fill-a', planId: 'plan-1' });
    addConcept({ id: 'fill-b', planId: 'plan-1' });
    addConcept({ id: 'prereq', planId: 'plan-1' });
    addWeakMastery('primary');
    addWeakMastery('fill-a');
    addWeakMastery('fill-b');
    addWeakMastery('prereq');
    addEdge('prereq', 'primary', 0.7);

    const targets = await pickSessionConcepts(USER_ID, 'primary', NOW);

    expect(targets.length).toBe(3);
    const ids = targets.map((t) => t.conceptId);
    expect(ids).not.toContain('prereq');
    expect(targets.every((t) => !t.isPrerequisite)).toBe(true);
  });

  it('skips a prerequisite that is on the cooldown/exclusion list', async () => {
    addConcept({ id: 'primary', planId: 'plan-1' });
    addConcept({ id: 'cooling-prereq', planId: 'plan-1' });
    addWeakMastery('primary');
    addWeakMastery('cooling-prereq');
    addEdge('cooling-prereq', 'primary', 0.7);

    const targets = await pickSessionConcepts(USER_ID, 'primary', NOW, new Set(['cooling-prereq']));

    const ids = targets.map((t) => t.conceptId);
    expect(ids).not.toContain('cooling-prereq');
    expect(ids).toEqual(['primary']);
  });

  // ─── regression: pre-existing pickSessionConcepts behavior unmodified ──

  it('returns [] when primaryConceptId is not a current weak/rusty area', async () => {
    addConcept({ id: 'primary', planId: 'plan-1' });
    addSolidMastery('primary');

    const targets = await pickSessionConcepts(USER_ID, 'primary', NOW);
    expect(targets).toEqual([]);
  });

  it('prefers same-plan fill over other-plan fill, with no prerequisite edges in play', async () => {
    addConcept({ id: 'primary', planId: 'plan-1' });
    addConcept({ id: 'same-plan', planId: 'plan-1' });
    addConcept({ id: 'other-plan', planId: 'plan-2' });
    addWeakMastery('primary', { weightedCorrect: 1, weightedTotal: 10, peakLcb: 0.2 });
    addWeakMastery('same-plan', { weightedCorrect: 1, weightedTotal: 10, peakLcb: 0.2 });
    addWeakMastery('other-plan', { weightedCorrect: 1, weightedTotal: 10, peakLcb: 0.2 });

    const targets = await pickSessionConcepts(USER_ID, 'primary', NOW);
    const ids = targets.map((t) => t.conceptId);
    expect(ids[0]).toBe('primary');
    expect(ids).toContain('same-plan');
  });

  it('caps at MAX_SESSION_CONCEPTS (3) total', async () => {
    addConcept({ id: 'primary', planId: 'plan-1' });
    addConcept({ id: 'f1', planId: 'plan-1' });
    addConcept({ id: 'f2', planId: 'plan-1' });
    addConcept({ id: 'f3', planId: 'plan-1' });
    for (const id of ['primary', 'f1', 'f2', 'f3']) addWeakMastery(id);

    const targets = await pickSessionConcepts(USER_ID, 'primary', NOW);
    expect(targets.length).toBe(3);
  });
});
