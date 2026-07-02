import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── mocks ──────────────────────────────────────────────────────────────
//
// `concept-weak-areas-loader.ts` talks only to `@/lib/db` (Prisma). Mocked
// here so `loadConceptWeakAreaRows` can be exercised as a pure unit against
// fixture `ConceptMastery` rows, following the `vi.mock('@/lib/db', ...)`
// idiom used in `concept-write.test.ts` / `concept-backfill.test.ts`.

const mocks = vi.hoisted(() => ({
  conceptMasteryFindMany: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    conceptMastery: {
      findMany: mocks.conceptMasteryFindMany,
    },
  },
}));

import { loadConceptWeakAreaRows } from './concept-weak-areas-loader';

// ─── fixtures ───────────────────────────────────────────────────────────

const USER_ID = 'user-1';

/** One raw `db.conceptMastery.findMany({ include: { concept } })` row, as
 *  the loader's Prisma query would shape it. */
function masteryRow(overrides: {
  conceptId: string;
  canonicalId?: string | null;
  label?: string;
  mergedLabelSnapshot?: string | null;
  planId?: string;
  slotId?: string;
  status?: string;
  weightedCorrect?: number;
  weightedTotal?: number;
  attemptCount?: number;
  lastAttemptAt?: Date | null;
  lastCorrectAt?: Date | null;
  peakLcb?: number;
}) {
  return {
    conceptId: overrides.conceptId,
    weightedCorrect: overrides.weightedCorrect ?? 0,
    weightedTotal: overrides.weightedTotal ?? 0,
    attemptCount: overrides.attemptCount ?? 0,
    lastAttemptAt: overrides.lastAttemptAt ?? null,
    lastCorrectAt: overrides.lastCorrectAt ?? null,
    peakLcb: overrides.peakLcb ?? 0,
    status: overrides.status ?? 'untested',
    concept: {
      id: overrides.conceptId,
      canonicalId: overrides.canonicalId ?? null,
      label: overrides.label ?? `Concept ${overrides.conceptId}`,
      mergedLabelSnapshot: overrides.mergedLabelSnapshot ?? null,
      planId: overrides.planId ?? 'plan-1',
      slotId: overrides.slotId ?? 'slot-1',
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── zero merges ≡ legacy per-call-site mapping ────────────────────────

describe('zero merges', () => {
  it('produces output identical to the legacy inline mapping for the same fixture rows', async () => {
    const lastAttemptAt = new Date('2026-06-01T00:00:00.000Z');
    const lastCorrectAt = new Date('2026-06-01T00:00:00.000Z');
    const rows = [
      masteryRow({
        conceptId: 'concept-a',
        label: 'Regular -ar verbs',
        planId: 'plan-1',
        slotId: 'slot-1',
        status: 'weak',
        weightedCorrect: 1.5,
        weightedTotal: 4,
        attemptCount: 4,
        lastAttemptAt,
        lastCorrectAt,
        peakLcb: 0.6,
      }),
      masteryRow({
        conceptId: 'concept-b',
        label: 'Irregular -er verbs',
        planId: 'plan-2',
        slotId: 'slot-9',
        status: 'solid',
        weightedCorrect: 3,
        weightedTotal: 3,
        attemptCount: 3,
        lastAttemptAt,
        lastCorrectAt,
        peakLcb: 0.9,
      }),
    ];
    mocks.conceptMasteryFindMany.mockResolvedValue(rows);

    const result = await loadConceptWeakAreaRows(USER_ID);

    // The legacy inline mapping every call site used to do, verbatim.
    const legacy = rows.map((m) => ({
      conceptId: m.conceptId,
      label: m.concept.label,
      planId: m.concept.planId,
      slotId: m.concept.slotId,
      status: m.status,
      weightedCorrect: m.weightedCorrect,
      weightedTotal: m.weightedTotal,
      attemptCount: m.attemptCount,
      lastAttemptAt: m.lastAttemptAt,
      lastCorrectAt: m.lastCorrectAt,
      peakLcb: m.peakLcb,
    }));

    // Order-independent comparison — the loader groups via a Map, so
    // insertion order across groups is preserved (one group per row here),
    // but assert by content to avoid over-constraining internal iteration.
    // `mergedSlotCount` is additive (Phase 4.2b, §11.6) — 1 for each of these
    // single-member groups, checked separately below rather than folded into
    // the "legacy mapping" fixture (which predates the field).
    expect(result).toHaveLength(legacy.length);
    for (const expected of legacy) {
      expect(result).toContainEqual(expect.objectContaining(expected));
    }
    expect(result.every((r) => r.mergedSlotCount === 1)).toBe(true);
  });

  it('queries only this user\'s ConceptMastery rows, joined to concept merge fields', async () => {
    mocks.conceptMasteryFindMany.mockResolvedValue([]);

    await loadConceptWeakAreaRows(USER_ID);

    expect(mocks.conceptMasteryFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: USER_ID },
        include: {
          concept: {
            select: {
              id: true,
              canonicalId: true,
              label: true,
              mergedLabelSnapshot: true,
              planId: true,
              slotId: true,
            },
          },
        },
      })
    );
  });

  it('scopes to conceptIds when the options.conceptIds filter is passed', async () => {
    mocks.conceptMasteryFindMany.mockResolvedValue([]);

    await loadConceptWeakAreaRows(USER_ID, { conceptIds: ['concept-a', 'concept-b'] });

    expect(mocks.conceptMasteryFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: USER_ID, conceptId: { in: ['concept-a', 'concept-b'] } },
      })
    );
  });
});

// ─── 2-row merge group unions to a hand-computed value ─────────────────

describe('2-row merge group', () => {
  it('unions decayed sums anchored to the group\'s latest lastAttemptAt', async () => {
    // concept-a is canonical (canonicalId: null); concept-b was merged into it.
    // concept-a's evidence is 10 days STALER than concept-b's — it must be
    // decayed FORWARD from its own lastAttemptAt to concept-b's (the later)
    // lastAttemptAt before summing, per §11.5.
    const olderAttempt = new Date('2026-05-22T00:00:00.000Z'); // 10 days before newer
    const newerAttempt = new Date('2026-06-01T00:00:00.000Z'); // group anchor

    const rows = [
      masteryRow({
        conceptId: 'concept-a',
        canonicalId: null,
        label: 'Regular -ar present tense',
        mergedLabelSnapshot: null,
        planId: 'plan-1',
        slotId: 'slot-1',
        status: 'weak',
        weightedCorrect: 2,
        weightedTotal: 4,
        attemptCount: 4,
        lastAttemptAt: olderAttempt,
        lastCorrectAt: olderAttempt,
        peakLcb: 0.5,
      }),
      masteryRow({
        conceptId: 'concept-b',
        canonicalId: 'concept-a', // merged into concept-a
        label: 'Regular -ar present-tense verbs',
        mergedLabelSnapshot: 'Regular -ar present tense', // frozen canonical label
        planId: 'plan-2',
        slotId: 'slot-9',
        status: 'building',
        weightedCorrect: 1,
        weightedTotal: 2,
        attemptCount: 2,
        lastAttemptAt: newerAttempt,
        lastCorrectAt: newerAttempt,
        peakLcb: 0.65,
      }),
    ];
    mocks.conceptMasteryFindMany.mockResolvedValue(rows);

    const result = await loadConceptWeakAreaRows(USER_ID);

    expect(result).toHaveLength(1);
    const merged = result[0];

    // Group key = canonicalId ?? id = 'concept-a' for both members.
    expect(merged.conceptId).toBe('concept-a');
    // Label = canonical member's mergedLabelSnapshot ?? label. concept-a IS
    // the canonical member and has no mergedLabelSnapshot of its own, so its
    // plain label wins.
    expect(merged.label).toBe('Regular -ar present tense');
    // planId/slotId/status come from the canonical member (concept-a).
    expect(merged.planId).toBe('plan-1');
    expect(merged.slotId).toBe('slot-1');
    expect(merged.status).toBe('weak');

    // latestAttemptAt = max(lastAttemptAt) across members.
    expect(merged.lastAttemptAt).toEqual(newerAttempt);
    expect(merged.lastCorrectAt).toEqual(newerAttempt);
    expect(merged.attemptCount).toBe(6); // 4 + 2, summed
    expect(merged.peakLcb).toBeCloseTo(0.65, 10); // max(0.5, 0.65)

    // Hand-computed expected value: concept-a's sums decay from olderAttempt
    // (10 days earlier) to newerAttempt using the 14-day half-life; concept-b's
    // sums need no decay (its own lastAttemptAt already IS the anchor).
    const daysSince = 10;
    const decayFactor = Math.pow(0.5, daysSince / 14);
    const expectedWeightedCorrect = 2 * decayFactor + 1;
    const expectedWeightedTotal = 4 * decayFactor + 2;

    expect(merged.weightedCorrect).toBeCloseTo(expectedWeightedCorrect, 10);
    expect(merged.weightedTotal).toBeCloseTo(expectedWeightedTotal, 10);

    // Phase 4.2b (§11.6): 2 distinct slotIds ('slot-1', 'slot-9') across the
    // group's members -> "Seen in 2 places".
    expect(merged.mergedSlotCount).toBe(2);
  });

  it('mergedSlotCount counts DISTINCT slotIds, not member rows (a repeated slotId still counts once)', async () => {
    const attemptAt = new Date('2026-06-01T00:00:00.000Z');
    const rows = [
      masteryRow({
        conceptId: 'concept-a',
        canonicalId: null,
        slotId: 'slot-shared',
        lastAttemptAt: attemptAt,
      }),
      masteryRow({
        conceptId: 'concept-b',
        canonicalId: 'concept-a',
        slotId: 'slot-shared', // same slot as concept-a — should not double-count
        lastAttemptAt: attemptAt,
      }),
    ];
    mocks.conceptMasteryFindMany.mockResolvedValue(rows);

    const result = await loadConceptWeakAreaRows(USER_ID);

    expect(result).toHaveLength(1);
    expect(result[0].mergedSlotCount).toBe(1);
  });

  it('falls back to the first member when the canonical concept has no mastery row of its own', async () => {
    // Only the MERGED sibling has a ConceptMastery row for this user — the
    // canonical concept itself was never directly attempted.
    const attemptAt = new Date('2026-06-01T00:00:00.000Z');
    const rows = [
      masteryRow({
        conceptId: 'concept-sibling',
        canonicalId: 'concept-canonical',
        label: 'Sibling label',
        mergedLabelSnapshot: 'Canonical label',
        planId: 'plan-2',
        slotId: 'slot-9',
        status: 'building',
        weightedCorrect: 1,
        weightedTotal: 2,
        attemptCount: 2,
        lastAttemptAt: attemptAt,
        lastCorrectAt: attemptAt,
        peakLcb: 0.4,
      }),
    ];
    mocks.conceptMasteryFindMany.mockResolvedValue(rows);

    const result = await loadConceptWeakAreaRows(USER_ID);

    expect(result).toHaveLength(1);
    const merged = result[0];
    expect(merged.conceptId).toBe('concept-canonical');
    // Falls back to the first (only) member's mergedLabelSnapshot ?? label.
    expect(merged.label).toBe('Canonical label');
    expect(merged.planId).toBe('plan-2');
    expect(merged.slotId).toBe('slot-9');
    expect(merged.status).toBe('building');
    expect(merged.weightedCorrect).toBeCloseTo(1, 10);
    expect(merged.weightedTotal).toBeCloseTo(2, 10);
    // Only one member -> one distinct slotId, even though it's the sibling's
    // (not the canonical concept's own) slot.
    expect(merged.mergedSlotCount).toBe(1);
  });
});

// ─── single-row group ≡ single-row passthrough ─────────────────────────

describe('single-row group', () => {
  it('matches the member row\'s own sums unchanged (no decay applied — anchor IS its own lastAttemptAt)', async () => {
    const lastAttemptAt = new Date('2026-06-10T00:00:00.000Z');
    const rows = [
      masteryRow({
        conceptId: 'concept-solo',
        label: 'Solo concept',
        status: 'building',
        weightedCorrect: 2.25,
        weightedTotal: 3.5,
        attemptCount: 5,
        lastAttemptAt,
        lastCorrectAt: lastAttemptAt,
        peakLcb: 0.55,
      }),
    ];
    mocks.conceptMasteryFindMany.mockResolvedValue(rows);

    const result = await loadConceptWeakAreaRows(USER_ID);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      conceptId: 'concept-solo',
      label: 'Solo concept',
      planId: 'plan-1',
      slotId: 'slot-1',
      status: 'building',
      weightedCorrect: 2.25,
      weightedTotal: 3.5,
      attemptCount: 5,
      lastAttemptAt,
      lastCorrectAt: lastAttemptAt,
      peakLcb: 0.55,
      mergedSlotCount: 1,
    });
  });

  it('never-attempted single row (lastAttemptAt: null) passes through with zeroed sums untouched', async () => {
    const rows = [
      masteryRow({
        conceptId: 'concept-fresh',
        label: 'Fresh concept',
        status: 'untested',
        weightedCorrect: 0,
        weightedTotal: 0,
        attemptCount: 0,
        lastAttemptAt: null,
        lastCorrectAt: null,
        peakLcb: 0,
      }),
    ];
    mocks.conceptMasteryFindMany.mockResolvedValue(rows);

    const result = await loadConceptWeakAreaRows(USER_ID);

    expect(result).toHaveLength(1);
    expect(result[0].lastAttemptAt).toBeNull();
    expect(result[0].weightedCorrect).toBe(0);
    expect(result[0].weightedTotal).toBe(0);
  });
});
