import { describe, it, expect } from 'vitest';
import {
  deriveConceptWeakAreas,
  attachUpstreamGapHints,
  NO_DATA_YET_COVERAGE_BELOW,
  UPSTREAM_GAP_MIN_CONFIDENCE,
  type ConceptWeakAreaRow,
  type ConceptWeakArea,
  type ConceptEdgeForHints,
  type PrereqMasteryRowForHints,
} from './concept-weak-areas';
import { wilsonLcb } from './concept-mastery';

// Fixture helper — keep each test's intent obvious by defaulting the noise.
// Defaults to a comfortably "untested" row (zero evidence) so each test only
// overrides the fields it actually cares about.
function row(r: Partial<ConceptWeakAreaRow> & { conceptId: string }): ConceptWeakAreaRow {
  return {
    label: `Concept ${r.conceptId}`,
    planId: 'plan-1',
    slotId: 'slot-1',
    status: 'untested',
    weightedCorrect: 0,
    weightedTotal: 0,
    attemptCount: 0,
    lastAttemptAt: null,
    lastCorrectAt: null,
    peakLcb: 0,
    ...r,
  };
}

const NOW = new Date('2026-07-01T00:00:00.000Z');

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);
}

describe('deriveConceptWeakAreas — scope filtering', () => {
  it("'all-paths' includes every row regardless of planId", () => {
    const result = deriveConceptWeakAreas({
      now: NOW,
      scope: { scope: 'all-paths' },
      concepts: [
        row({ conceptId: 'a', planId: 'plan-1', weightedCorrect: 1, weightedTotal: 5, lastAttemptAt: daysAgo(1) }),
        row({ conceptId: 'b', planId: 'plan-2', weightedCorrect: 1, weightedTotal: 5, lastAttemptAt: daysAgo(1) }),
      ],
    });
    expect(result.coverage.totalConcepts).toBe(2);
  });

  it("'path' scope keeps only rows with a matching planId", () => {
    const result = deriveConceptWeakAreas({
      now: NOW,
      scope: { scope: 'path', planId: 'plan-1' },
      concepts: [
        row({ conceptId: 'a', planId: 'plan-1', weightedCorrect: 1, weightedTotal: 5, lastAttemptAt: daysAgo(1) }),
        row({ conceptId: 'b', planId: 'plan-2', weightedCorrect: 1, weightedTotal: 5, lastAttemptAt: daysAgo(1) }),
      ],
    });
    expect(result.coverage.totalConcepts).toBe(1);
    expect(result.areas.every((a) => a.planId === 'plan-1')).toBe(true);
  });

  it("'exam' scope keeps rows whose planId is in the given planIds list", () => {
    const result = deriveConceptWeakAreas({
      now: NOW,
      scope: { scope: 'exam', planIds: ['plan-1', 'plan-3'] },
      concepts: [
        row({ conceptId: 'a', planId: 'plan-1', weightedCorrect: 1, weightedTotal: 5, lastAttemptAt: daysAgo(1) }),
        row({ conceptId: 'b', planId: 'plan-2', weightedCorrect: 1, weightedTotal: 5, lastAttemptAt: daysAgo(1) }),
        row({ conceptId: 'c', planId: 'plan-3', weightedCorrect: 1, weightedTotal: 5, lastAttemptAt: daysAgo(1) }),
      ],
    });
    expect(result.coverage.totalConcepts).toBe(2);
    expect(result.areas.map((a) => a.conceptId).sort()).toEqual(['a', 'c']);
  });
});

describe('deriveConceptWeakAreas — coverage stat', () => {
  it('computes concentratedConcepts as the re-decayed weightedTotal >= 2.5 fraction', () => {
    const result = deriveConceptWeakAreas({
      now: NOW,
      scope: { scope: 'all-paths' },
      concepts: [
        // Plenty of recent evidence — counts toward coverage.
        row({ conceptId: 'a', weightedCorrect: 4, weightedTotal: 5, lastAttemptAt: daysAgo(1) }),
        // Thin evidence — does not count.
        row({ conceptId: 'b', weightedCorrect: 0.5, weightedTotal: 1, lastAttemptAt: daysAgo(1) }),
        // Zero evidence (never attempted) — does not count.
        row({ conceptId: 'c' }),
        // Old evidence whose re-decayed weightedTotal drops below the gate —
        // confirms decay is applied before the coverage check, not the raw stored value.
        row({ conceptId: 'd', weightedCorrect: 2.6, weightedTotal: 2.6, lastAttemptAt: daysAgo(60) }),
      ],
    });
    expect(result.coverage.totalConcepts).toBe(4);
    expect(result.coverage.concentratedConcepts).toBe(1);
    expect(result.coverage.fraction).toBeCloseTo(0.25, 5);
  });

  it('reports fraction 0 with zero concepts in scope (never divides by zero)', () => {
    const result = deriveConceptWeakAreas({ now: NOW, scope: { scope: 'all-paths' }, concepts: [] });
    expect(result.coverage.totalConcepts).toBe(0);
    expect(result.coverage.fraction).toBe(0);
  });
});

describe('deriveConceptWeakAreas — ranking order', () => {
  it('ranks higher-impact (lower lcb, more evidence) concepts first', () => {
    const result = deriveConceptWeakAreas({
      now: NOW,
      scope: { scope: 'all-paths' },
      concepts: [
        // Mild weakness, decent evidence.
        row({ conceptId: 'mild', weightedCorrect: 2.4, weightedTotal: 5, lastAttemptAt: daysAgo(1) }),
        // Severe weakness (near-zero correct), more evidence → should outrank 'mild'.
        row({ conceptId: 'severe', weightedCorrect: 0.2, weightedTotal: 8, lastAttemptAt: daysAgo(1) }),
        // Severe but thin evidence — bad lcb but little weight behind it.
        // weightedTotal set comfortably above the 2.5 untested gate so a
        // one-day decay doesn't push it back under (this test is about
        // ranking, not the gate boundary — that's covered separately).
        row({ conceptId: 'thin', weightedCorrect: 0, weightedTotal: 3, lastAttemptAt: daysAgo(1) }),
      ],
    });
    const order = result.areas.map((a) => a.conceptId);
    expect(order[0]).toBe('severe');
    // 'thin' has the worst lcb but the least evidence behind it, so it should
    // not necessarily beat 'mild' on impact — assert it is present but ranked,
    // and that impactPoints is monotonically non-increasing across the list.
    for (let i = 1; i < result.areas.length; i++) {
      expect(result.areas[i - 1].impactPoints).toBeGreaterThanOrEqual(result.areas[i].impactPoints);
    }
    expect(order).toContain('mild');
    expect(order).toContain('thin');
  });

  it('bands impact relative to the worst offender in the result', () => {
    const result = deriveConceptWeakAreas({
      now: NOW,
      scope: { scope: 'all-paths' },
      concepts: [
        row({ conceptId: 'worst', weightedCorrect: 0, weightedTotal: 10, lastAttemptAt: daysAgo(1) }),
        row({ conceptId: 'mild', weightedCorrect: 2.4, weightedTotal: 5, lastAttemptAt: daysAgo(1) }),
      ],
    });
    const worst = result.areas.find((a) => a.conceptId === 'worst');
    expect(worst?.impact).toBe('high');
  });
});

describe('deriveConceptWeakAreas — band classification & exclusions', () => {
  it('excludes untested concepts (insufficient evidence) from the weak list', () => {
    const result = deriveConceptWeakAreas({
      now: NOW,
      scope: { scope: 'all-paths' },
      concepts: [row({ conceptId: 'fresh', weightedCorrect: 0, weightedTotal: 1, lastAttemptAt: daysAgo(1) })],
    });
    expect(result.areas).toHaveLength(0);
    expect(result.coldStart).toBe('no_data_yet');
  });

  it('excludes solid concepts (high lcb) from the weak list', () => {
    const result = deriveConceptWeakAreas({
      now: NOW,
      scope: { scope: 'all-paths' },
      concepts: [
        row({ conceptId: 'great', weightedCorrect: 9.5, weightedTotal: 10, lastAttemptAt: daysAgo(1), peakLcb: 0.9 }),
      ],
    });
    expect(result.areas).toHaveLength(0);
    expect(result.byBand.weak).toHaveLength(0);
    expect(result.byBand.rusty).toHaveLength(0);
  });

  it('excludes building concepts (mid lcb) from the weak list', () => {
    // weightedTotal high enough to be tested; lcb should land in [0.55, 0.75).
    const wt = 20;
    const wc = 14; // pHat = 0.7, plenty of evidence pulls lcb close to pHat.
    const result = deriveConceptWeakAreas({
      now: NOW,
      scope: { scope: 'all-paths' },
      concepts: [row({ conceptId: 'mid', weightedCorrect: wc, weightedTotal: wt, lastAttemptAt: daysAgo(1) })],
    });
    const lcb = wilsonLcb(wc, wt);
    expect(lcb).toBeGreaterThanOrEqual(0.55);
    expect(lcb).toBeLessThan(0.75);
    expect(result.areas).toHaveLength(0);
  });

  it('surfaces a stale once-solid concept (high peakLcb, old lastAttemptAt) as rusty after re-decay', () => {
    const result = deriveConceptWeakAreas({
      now: NOW,
      scope: { scope: 'all-paths' },
      concepts: [
        row({
          conceptId: 'stale',
          // Was solid (peakLcb >= 0.75) a long time ago; weightedTotal has
          // decayed below the rusty lcb threshold but the high peakLcb proves
          // it was once mastered, not merely undertested.
          weightedCorrect: 9,
          weightedTotal: 10,
          peakLcb: 0.85,
          lastAttemptAt: daysAgo(60),
          lastCorrectAt: daysAgo(60),
        }),
      ],
    });
    expect(result.areas).toHaveLength(1);
    expect(result.areas[0].band).toBe('rusty');
    expect(result.areas[0].whyFlagged.toLowerCase()).toContain('rusty');
    expect(result.byBand.rusty).toHaveLength(1);
  });

  it('flags a confidently-weak concept with the "weak" band and a scored-below-target reason', () => {
    const result = deriveConceptWeakAreas({
      now: NOW,
      scope: { scope: 'all-paths' },
      concepts: [row({ conceptId: 'bad', weightedCorrect: 1, weightedTotal: 10, lastAttemptAt: daysAgo(1) })],
    });
    expect(result.areas).toHaveLength(1);
    expect(result.areas[0].band).toBe('weak');
    expect(result.areas[0].whyFlagged).toMatch(/scored below target/i);
  });
});

describe('deriveConceptWeakAreas — three-state cold-start (plan §6.3)', () => {
  it("'no data yet' when coverage fraction is below the threshold", () => {
    // 1 concentrated out of 6 = 0.1667, strictly below the 0.2 cutoff (1/5
    // would land exactly ON the threshold, which is "all clear" territory).
    const result = deriveConceptWeakAreas({
      now: NOW,
      scope: { scope: 'all-paths' },
      concepts: [
        row({ conceptId: 'a', weightedCorrect: 4, weightedTotal: 5, lastAttemptAt: daysAgo(1) }),
        row({ conceptId: 'b' }),
        row({ conceptId: 'c' }),
        row({ conceptId: 'd' }),
        row({ conceptId: 'e' }),
        row({ conceptId: 'f' }),
      ],
    });
    expect(result.coverage.fraction).toBeLessThan(NO_DATA_YET_COVERAGE_BELOW);
    expect(result.coldStart).toBe('no_data_yet');
  });

  it("'no data yet' when there are zero classified concepts at all", () => {
    const result = deriveConceptWeakAreas({ now: NOW, scope: { scope: 'all-paths' }, concepts: [] });
    expect(result.coldStart).toBe('no_data_yet');
  });

  it("'all clear' when coverage clears the threshold and nothing is weak/rusty", () => {
    const concepts = Array.from({ length: 5 }, (_, i) =>
      row({ conceptId: `solid-${i}`, weightedCorrect: 4.5, weightedTotal: 5, lastAttemptAt: daysAgo(1), peakLcb: 0.85 })
    );
    const result = deriveConceptWeakAreas({ now: NOW, scope: { scope: 'all-paths' }, concepts });
    expect(result.coverage.fraction).toBeGreaterThanOrEqual(NO_DATA_YET_COVERAGE_BELOW);
    expect(result.areas).toHaveLength(0);
    expect(result.coldStart).toBe('all_clear');
  });

  it("'weak spots found' when coverage clears the threshold and at least one concept is weak/rusty", () => {
    const concepts = [
      row({ conceptId: 'weak-1', weightedCorrect: 1, weightedTotal: 10, lastAttemptAt: daysAgo(1) }),
      row({ conceptId: 'solid-1', weightedCorrect: 4.5, weightedTotal: 5, lastAttemptAt: daysAgo(1), peakLcb: 0.85 }),
      row({ conceptId: 'solid-2', weightedCorrect: 4.5, weightedTotal: 5, lastAttemptAt: daysAgo(1), peakLcb: 0.85 }),
    ];
    const result = deriveConceptWeakAreas({ now: NOW, scope: { scope: 'all-paths' }, concepts });
    expect(result.coverage.fraction).toBeGreaterThanOrEqual(NO_DATA_YET_COVERAGE_BELOW);
    expect(result.coldStart).toBe('weak_spots_found');
    expect(result.areas.length).toBeGreaterThan(0);
  });
});

// ─── attachUpstreamGapHints (Phase 4.2b, plan phase4 §12.6) ────────────────

describe('attachUpstreamGapHints', () => {
  // Minimal fixture area — only the fields attachUpstreamGapHints reads
  // (conceptId) are load-bearing; the rest just need to satisfy the type.
  function area(overrides: Partial<ConceptWeakArea> & { conceptId: string }): ConceptWeakArea {
    return {
      label: `Area ${overrides.conceptId}`,
      planId: 'plan-1',
      slotId: 'slot-1',
      band: 'weak',
      masteryScore: 20,
      lcb: 0.2,
      weightedTotal: 5,
      impactPoints: 1,
      impact: 'high',
      daysSinceLastAttempt: 1,
      whyFlagged: 'Scored below target on recent attempts.',
      ...overrides,
    };
  }

  function edge(overrides: Partial<ConceptEdgeForHints>): ConceptEdgeForHints {
    return { fromConceptId: 'prereq', toConceptId: 'target', confidence: 0.7, ...overrides };
  }

  function prereqRow(overrides: Partial<PrereqMasteryRowForHints> & { conceptId: string }): PrereqMasteryRowForHints {
    return {
      label: `Prereq ${overrides.conceptId}`,
      weightedCorrect: 0,
      weightedTotal: 0,
      attemptCount: 0,
      lastAttemptAt: null,
      lastCorrectAt: null,
      peakLcb: 0,
      ...overrides,
    };
  }

  it('attaches a hint when the upstream prerequisite is itself weak', () => {
    const areas = [area({ conceptId: 'target' })];
    const edges = [edge({ fromConceptId: 'prereq', toConceptId: 'target', confidence: 0.7 })];
    const prereqRows = [
      prereqRow({ conceptId: 'prereq', label: 'Regular -ar verbs', weightedCorrect: 1, weightedTotal: 10, lastAttemptAt: NOW }),
    ];

    const result = attachUpstreamGapHints(areas, edges, prereqRows, NOW);

    expect(result[0].upstreamGap).toEqual({ conceptId: 'prereq', label: 'Regular -ar verbs', band: 'weak' });
  });

  it('does not attach a hint when the upstream prerequisite is solid', () => {
    const areas = [area({ conceptId: 'target' })];
    const edges = [edge({ fromConceptId: 'prereq', toConceptId: 'target', confidence: 0.7 })];
    const prereqRows = [
      prereqRow({
        conceptId: 'prereq',
        label: 'Regular -ar verbs',
        weightedCorrect: 9.5,
        weightedTotal: 10,
        peakLcb: 0.9,
        lastAttemptAt: NOW,
      }),
    ];

    const result = attachUpstreamGapHints(areas, edges, prereqRows, NOW);

    expect(result[0].upstreamGap).toBeUndefined();
  });

  it('returns areas unchanged when there are no edges at all', () => {
    const areas = [area({ conceptId: 'target' })];

    const result = attachUpstreamGapHints(areas, [], [], NOW);

    expect(result).toBe(areas); // early-return, same reference
    expect(result[0].upstreamGap).toBeUndefined();
  });

  it('suppresses an edge below the confidence display gate (0.35 structural_phase_order)', () => {
    const areas = [area({ conceptId: 'target' })];
    const edges = [edge({ fromConceptId: 'prereq', toConceptId: 'target', confidence: 0.35 })];
    const prereqRows = [
      prereqRow({ conceptId: 'prereq', weightedCorrect: 1, weightedTotal: 10, lastAttemptAt: NOW }),
    ];

    const result = attachUpstreamGapHints(areas, edges, prereqRows, NOW);

    expect(result[0].upstreamGap).toBeUndefined();
  });

  it('confirms the display gate is exactly >= 0.5 (0.5 itself clears it)', () => {
    expect(UPSTREAM_GAP_MIN_CONFIDENCE).toBe(0.5);
    const areas = [area({ conceptId: 'target' })];
    const edges = [edge({ fromConceptId: 'prereq', toConceptId: 'target', confidence: 0.5 })];
    const prereqRows = [
      prereqRow({ conceptId: 'prereq', weightedCorrect: 1, weightedTotal: 10, lastAttemptAt: NOW }),
    ];

    const result = attachUpstreamGapHints(areas, edges, prereqRows, NOW);

    expect(result[0].upstreamGap).toBeDefined();
  });

  it('treats a prerequisite with no mastery row at all as band "untested" and still attaches a hint', () => {
    const areas = [area({ conceptId: 'target' })];
    const edges = [edge({ fromConceptId: 'never-attempted', toConceptId: 'target', confidence: 0.7 })];

    const result = attachUpstreamGapHints(areas, edges, [], NOW);

    expect(result[0].upstreamGap).toEqual({
      conceptId: 'never-attempted',
      label: 'never-attempted',
      band: 'untested',
    });
  });

  it('picks the highest-confidence struggling edge when multiple edges target the same area', () => {
    const areas = [area({ conceptId: 'target' })];
    const edges = [
      edge({ fromConceptId: 'weak-low-conf', toConceptId: 'target', confidence: 0.55 }),
      edge({ fromConceptId: 'weak-high-conf', toConceptId: 'target', confidence: 0.7 }),
    ];
    const prereqRows = [
      prereqRow({ conceptId: 'weak-low-conf', weightedCorrect: 1, weightedTotal: 10, lastAttemptAt: NOW }),
      prereqRow({ conceptId: 'weak-high-conf', weightedCorrect: 1, weightedTotal: 10, lastAttemptAt: NOW }),
    ];

    const result = attachUpstreamGapHints(areas, edges, prereqRows, NOW);

    expect(result[0].upstreamGap?.conceptId).toBe('weak-high-conf');
  });

  it('falls through to a lower-confidence struggling edge when the top edge\'s upstream is solid', () => {
    const areas = [area({ conceptId: 'target' })];
    const edges = [
      edge({ fromConceptId: 'solid-high-conf', toConceptId: 'target', confidence: 0.7 }),
      edge({ fromConceptId: 'weak-lower-conf', toConceptId: 'target', confidence: 0.55 }),
    ];
    const prereqRows = [
      prereqRow({
        conceptId: 'solid-high-conf',
        weightedCorrect: 9.5,
        weightedTotal: 10,
        peakLcb: 0.9,
        lastAttemptAt: NOW,
      }),
      prereqRow({ conceptId: 'weak-lower-conf', weightedCorrect: 1, weightedTotal: 10, lastAttemptAt: NOW }),
    ];

    const result = attachUpstreamGapHints(areas, edges, prereqRows, NOW);

    expect(result[0].upstreamGap?.conceptId).toBe('weak-lower-conf');
  });

  it('leaves areas with no inbound edges unaffected while attaching hints to others', () => {
    const areas = [area({ conceptId: 'has-edge' }), area({ conceptId: 'no-edge' })];
    const edges = [edge({ fromConceptId: 'prereq', toConceptId: 'has-edge', confidence: 0.7 })];
    const prereqRows = [
      prereqRow({ conceptId: 'prereq', weightedCorrect: 1, weightedTotal: 10, lastAttemptAt: NOW }),
    ];

    const result = attachUpstreamGapHints(areas, edges, prereqRows, NOW);

    expect(result.find((a) => a.conceptId === 'has-edge')?.upstreamGap).toBeDefined();
    expect(result.find((a) => a.conceptId === 'no-edge')?.upstreamGap).toBeUndefined();
  });

  it('does not mutate the input areas array or its member objects', () => {
    const original = area({ conceptId: 'target' });
    const areas = [original];
    const edges = [edge({ fromConceptId: 'prereq', toConceptId: 'target', confidence: 0.7 })];
    const prereqRows = [
      prereqRow({ conceptId: 'prereq', weightedCorrect: 1, weightedTotal: 10, lastAttemptAt: NOW }),
    ];

    attachUpstreamGapHints(areas, edges, prereqRows, NOW);

    expect(original.upstreamGap).toBeUndefined();
  });
});
