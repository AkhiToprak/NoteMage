/**
 * Weakness Training Phase 1A — the one canonical concept-weakness ranking
 * function.
 *
 * PURE module: no Prisma, no DB, no network. Generalizes `exam-readiness.ts`'s
 * `deriveWeakAreas()` banding/impact-scoring idiom (severity band + impact
 * score, ranked, grouped) but keyed off `ConceptMastery` rows instead of
 * whole checkpoints/quiz-sets. Canonical source: `plans/weakness-training.md`
 * §6.2 "One canonical ranking function", §2.1.1 "status is a cache; reads
 * must re-decay", §6.3 "Three-state cold-start".
 *
 * This function OWNS the read-time re-decay (§2.1.1): callers pass raw
 * `ConceptMastery`-shaped rows + the current timestamp; `classifyBand` (from
 * `concept-mastery.ts`) is the single source of truth for re-decaying the
 * stored sums into an authoritative band — this file never reimplements decay
 * math, it only ranks and groups the result.
 *
 * Per §6.3, only `weak` and `rusty` concepts are "actionable" — `untested`,
 * `building`, and `solid` never surface in the ranked list, though they still
 * count toward the coverage stat (the denominator needs every concept, not
 * just the flagged ones).
 *
 * Phase 1A scope note: this is a NEW standalone function. `exam-readiness.ts`'s
 * `deriveWeakAreas()` is NOT modified or refactored here — the plan only says
 * that convergence happens "once Phase 1 ships" (a later phase). Do not import
 * from or mutate `exam-readiness.ts` in this file.
 */

import {
  classifyBand,
  decaySums,
  wilsonLcb,
  masteryScore,
  UNTESTED_BELOW_TOTAL,
  type MasteryBand,
  type MasteryInputs,
} from './concept-mastery';

// ─── Tunable constants ──────────────────────────────────────────────────────

/**
 * Coverage fraction (re-decayed `weightedTotal >= UNTESTED_BELOW_TOTAL`,
 * i.e. concept-mastery.ts's confidence gate) below which the cold-start state
 * is "no data yet" rather than "all clear" — plan §6.3 / §4. Named so it's
 * tunable without touching the classification logic.
 */
export const NO_DATA_YET_COVERAGE_BELOW = 0.2;

// ─── Input shape ────────────────────────────────────────────────────────────

/**
 * One concept's mastery state, as the caller would load it from
 * `db.conceptMastery.findMany({ include: { concept: true } })` flattened to
 * the fields this module needs. Carries the full {@link MasteryInputs}
 * contract (so `classifyBand`/`decaySums`/`wilsonLcb` can be called directly)
 * plus the concept metadata needed for display/grouping/scoping.
 */
export interface ConceptWeakAreaRow extends MasteryInputs {
  conceptId: string;
  label: string;
  /** `StudyPlan.id` this concept was extracted from. */
  planId: string;
  /** `CheckpointSlot.id` this concept was extracted from. */
  slotId: string;
  /**
   * The DB's cached `ConceptMastery.status` (write-time cache, §2.1.1) — NOT
   * trusted for the returned band, but threaded through for callers that want
   * to compare cache-vs-live (e.g. debug surfaces) or pre-filter a query.
   */
  status: MasteryBand | string;
}

/** Mirrors how `exam-readiness.ts`/`exam-scope.ts` scope a rollup: the whole
 *  learner's recent paths, one path, or the union of paths covering an exam. */
export type ConceptWeakAreaScope =
  | { scope: 'all-paths' }
  | { scope: 'path'; planId: string }
  | { scope: 'exam'; planIds: string[] };

export interface DeriveConceptWeakAreasInput {
  concepts: ConceptWeakAreaRow[];
  now: Date;
  scope: ConceptWeakAreaScope;
}

// ─── Output shape ───────────────────────────────────────────────────────────

/** Relative priority of a weak concept, banded against the worst offender in
 *  this result — mirrors `WeakAreaImpact` in `exam-readiness.ts`. */
export type ConceptWeakAreaImpact = 'high' | 'medium' | 'low';

export interface ConceptWeakArea {
  conceptId: string;
  label: string;
  planId: string;
  slotId: string;
  /** Authoritative band, re-decayed to `now` via `classifyBand`. Always
   *  `'weak'` or `'rusty'` in this list (§6.3 — the only actionable bands). */
  band: 'weak' | 'rusty';
  /** 0-100 display mastery score (Beta(1,1) prior), re-decayed to `now`. */
  masteryScore: number;
  /** Re-decayed Wilson lower-confidence-bound, the actual severity signal. */
  lcb: number;
  /** Re-decayed evidence total — how much real signal backs this concept. */
  weightedTotal: number;
  /**
   * Ranking score: modeled on `exam-readiness.ts`'s `impactPoints` (severity
   * × evidence weight) — `(WEAK_BELOW_LCB_REFERENCE - lcb) * evidenceFactor`,
   * where a lower lcb and a larger weightedTotal both push impact up (a
   * confidently-bad concept with lots of evidence outranks a barely-weak one
   * backed by a single attempt). Always >= 0; never fabricated beyond what
   * `lcb`/`weightedTotal` already encode.
   */
  impactPoints: number;
  /** `impactPoints` banded relative to the worst weak area in this result. */
  impact: ConceptWeakAreaImpact;
  /** Days since the last attempt on this concept, or null if never attempted. */
  daysSinceLastAttempt: number | null;
  /** Honest, signal-only explanation — see {@link buildWhyFlagged}. */
  whyFlagged: string;
  /**
   * Weakness Training Phase 4.2b (plan phase4 §12.6) — the highest-confidence
   * upstream prerequisite whose RE-DECAYED band is itself weak/rusty/untested,
   * when one exists. Attached by the separate, pure {@link attachUpstreamGapHints}
   * post-processing step (`deriveConceptWeakAreas` itself never touches
   * `ConceptEdge` rows and stays untested-code-untouched, per plan §12.6).
   * Undefined when no edge clears the display gate (`confidence >= 0.5`) or
   * no edge into this concept has a struggling upstream.
   */
  upstreamGap?: { conceptId: string; label: string; band: 'weak' | 'rusty' | 'untested' };
}

export interface ConceptWeakAreaCoverage {
  /** Concepts considered in this scope (before band filtering). */
  totalConcepts: number;
  /** Concepts whose re-decayed `weightedTotal >= UNTESTED_BELOW_TOTAL`
   *  (concept-mastery.ts's confidence gate) — i.e. "have enough data". */
  concentratedConcepts: number;
  /** `concentratedConcepts / totalConcepts`, 0 when there are zero concepts. */
  fraction: number;
}

/** The three-state cold-start classification from plan §6.3. */
export type ConceptWeakAreaColdStart = 'no_data_yet' | 'all_clear' | 'weak_spots_found';

export interface DeriveConceptWeakAreasResult {
  scope: ConceptWeakAreaScope;
  /** Weak/rusty concepts only (§6.3), ranked by `impactPoints` descending. */
  areas: ConceptWeakArea[];
  /** Same `areas`, grouped by band for UI sectioning. */
  byBand: Record<'weak' | 'rusty', ConceptWeakArea[]>;
  coverage: ConceptWeakAreaCoverage;
  /** Which of the three §6.3 cold-start states applies to this result. */
  coldStart: ConceptWeakAreaColdStart;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function inScope(row: ConceptWeakAreaRow, scope: ConceptWeakAreaScope): boolean {
  if (scope.scope === 'all-paths') return true;
  if (scope.scope === 'path') return row.planId === scope.planId;
  return scope.planIds.includes(row.planId);
}

function daysSince(lastAttemptAt: Date | null, now: Date): number | null {
  if (!lastAttemptAt) return null;
  return Math.max(0, (now.getTime() - lastAttemptAt.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Honest, signal-only why-flagged copy per plan §6.3/§6.5 — drawn only from
 * the row's real numbers, never a fabricated or psychological claim.
 */
function buildWhyFlagged(band: 'weak' | 'rusty', days: number | null): string {
  if (band === 'rusty') {
    const daysLabel = days === null ? 'a while' : `${Math.round(days)} days`;
    return `Hasn't come up in ${daysLabel} — might be rusty.`;
  }
  return 'Scored below target on recent attempts.';
}

/**
 * Ranking score modeled on `exam-readiness.ts`'s `deriveWeakAreas()` impact
 * idiom: severity (how far below the mastery gate the lcb sits) × evidence
 * weight (how much of that severity reading to trust). Lower lcb and higher
 * weightedTotal both increase impact; a concept with thin evidence is real
 * but ranks below an equally-bad concept backed by more attempts.
 */
function computeImpactPoints(lcb: number, weightedTotal: number): number {
  const severity = Math.max(0, 1 - lcb);
  return severity * weightedTotal;
}

// ─── Main entry point ───────────────────────────────────────────────────────

/**
 * Pure ranking function — the ONE canonical weakness rollup (plan §6.2).
 * Re-decays every input row to `input.now` via `classifyBand`/`decaySums`/
 * `wilsonLcb` (so the result is correct regardless of how stale the stored
 * `ConceptMastery.status` cache is — §2.1.1), filters to the scope, then:
 *
 *  - keeps only `weak`/`rusty` concepts in the ranked `areas` list (§6.3 —
 *    `untested`/`building`/`solid` are never "actionable"),
 *  - computes the path-level `coverage` stat across ALL in-scope concepts
 *    (not just the flagged ones) so callers can distinguish "no data yet"
 *    from "all clear",
 *  - classifies the overall result into one of the three §6.3 cold-start
 *    states.
 */
export function deriveConceptWeakAreas(input: DeriveConceptWeakAreasInput): DeriveConceptWeakAreasResult {
  const { concepts, now, scope } = input;
  const scoped = concepts.filter((row) => inScope(row, scope));

  let concentratedConcepts = 0;
  const raw: Omit<ConceptWeakArea, 'impact'>[] = [];

  for (const row of scoped) {
    const band = classifyBand(row, now);
    const decayed = decaySums({ weightedCorrect: row.weightedCorrect, weightedTotal: row.weightedTotal }, row.lastAttemptAt, now);
    const lcb = wilsonLcb(decayed.weightedCorrect, decayed.weightedTotal);
    const score = masteryScore(decayed.weightedCorrect, decayed.weightedTotal);

    if (decayed.weightedTotal >= UNTESTED_BELOW_TOTAL) concentratedConcepts += 1;

    if (band !== 'weak' && band !== 'rusty') continue;

    const days = daysSince(row.lastAttemptAt, now);
    raw.push({
      conceptId: row.conceptId,
      label: row.label,
      planId: row.planId,
      slotId: row.slotId,
      band,
      masteryScore: score,
      lcb,
      weightedTotal: decayed.weightedTotal,
      impactPoints: computeImpactPoints(lcb, decayed.weightedTotal),
      daysSinceLastAttempt: days,
      whyFlagged: buildWhyFlagged(band, days),
    });
  }

  const maxImpact = raw.reduce((m, a) => Math.max(m, a.impactPoints), 0);
  const areas: ConceptWeakArea[] = raw
    .map((a) => {
      const ratio = maxImpact > 0 ? a.impactPoints / maxImpact : 0;
      const impact: ConceptWeakAreaImpact = ratio >= 0.6 ? 'high' : ratio >= 0.3 ? 'medium' : 'low';
      return { ...a, impact };
    })
    .sort((a, b) => b.impactPoints - a.impactPoints || a.lcb - b.lcb);

  const byBand: Record<'weak' | 'rusty', ConceptWeakArea[]> = {
    weak: areas.filter((a) => a.band === 'weak'),
    rusty: areas.filter((a) => a.band === 'rusty'),
  };

  const totalConcepts = scoped.length;
  const fraction = totalConcepts > 0 ? concentratedConcepts / totalConcepts : 0;
  const coverage: ConceptWeakAreaCoverage = { totalConcepts, concentratedConcepts, fraction };

  let coldStart: ConceptWeakAreaColdStart;
  if (totalConcepts === 0 || fraction < NO_DATA_YET_COVERAGE_BELOW) {
    coldStart = 'no_data_yet';
  } else if (areas.length === 0) {
    coldStart = 'all_clear';
  } else {
    coldStart = 'weak_spots_found';
  }

  return { scope, areas, byBand, coverage, coldStart };
}

// ─── Upstream-gap hints (Phase 4.2b, plan phase4 §12.6) ────────────────────

/**
 * One `ConceptEdge` row as this module needs it — already resolved through
 * `canonicalId ?? id` on BOTH endpoints by the caller (plan §10.1 "canonical
 * resolution is read-time, everywhere"; this module never touches Prisma or
 * `Concept.canonicalId` itself).
 */
export interface ConceptEdgeForHints {
  fromConceptId: string; // the prerequisite (upstream)
  toConceptId: string; // the dependent concept — an area's conceptId
  confidence: number;
}

/**
 * Minimal shape this module needs to classify an upstream prerequisite's
 * band — the label plus whatever `classifyBand`/`decaySums` require. Callers
 * pass one row per prerequisite concept that HAS a `ConceptMastery` row for
 * this user; a prerequisite with no row at all is treated as `untested`
 * (never attempted — see {@link attachUpstreamGapHints}).
 */
export interface PrereqMasteryRowForHints extends MasteryInputs {
  conceptId: string;
  label: string;
}

/** Display gate (plan §12.6): "bare phase-order edges count for session
 *  composition but not for user-facing claims" — `structural_phase_order`'s
 *  default confidence (0.35) sits below this, `structural_covers_slot`
 *  (0.55) and `llm_stage_a` (0.7) both clear it. */
export const UPSTREAM_GAP_MIN_CONFIDENCE = 0.5;

/**
 * Pure post-processing step (plan §12.6) — attaches `upstreamGap` to any
 * `area` in `areas` that has an inbound prerequisite edge whose upstream
 * concept is ITSELF currently struggling. `deriveConceptWeakAreas` stays
 * completely untouched by this (separate function, separate call) so its
 * existing test coverage and purity guarantee are undisturbed.
 *
 * Algorithm, per area:
 *  1. Collect every edge with `toConceptId === area.conceptId`.
 *  2. Drop edges below {@link UPSTREAM_GAP_MIN_CONFIDENCE} — a bare
 *     structural-phase-order edge is real enough to prefer in session
 *     composition (§12.4) but too weak a claim to surface to the user.
 *  3. Among the survivors, sorted DESCENDING by confidence (stable — this
 *     function sorts internally, so callers don't have to pre-sort), classify
 *     each edge's `fromConceptId` band: look up its mastery row in
 *     `prereqMasteryRows` (by `conceptId`) and re-decay via `classifyBand`
 *     (never trust a stored `status` — this module's whole discipline, see
 *     the file header); a prerequisite with NO mastery row at all (never
 *     attempted) is `untested` by construction (zero evidence). The FIRST
 *     edge (highest confidence) whose upstream band is
 *     `weak`/`rusty`/`untested` wins.
 *  4. If no edge's upstream concept is struggling (all solid/building, or no
 *     edges at all, or none clear the confidence gate), `area` is returned
 *     unchanged — no `upstreamGap`.
 *
 * `areas` and its member objects are never mutated in place — this returns a
 * new array (new objects only for areas that gain a hint).
 */
export function attachUpstreamGapHints(
  areas: ConceptWeakArea[],
  edges: ConceptEdgeForHints[],
  prereqMasteryRows: PrereqMasteryRowForHints[],
  now: Date
): ConceptWeakArea[] {
  if (areas.length === 0 || edges.length === 0) return areas;

  const prereqByConceptId = new Map<string, PrereqMasteryRowForHints>();
  for (const row of prereqMasteryRows) {
    prereqByConceptId.set(row.conceptId, row);
  }

  const edgesByTarget = new Map<string, ConceptEdgeForHints[]>();
  for (const edge of edges) {
    if (edge.confidence < UPSTREAM_GAP_MIN_CONFIDENCE) continue;
    const bucket = edgesByTarget.get(edge.toConceptId);
    if (bucket) bucket.push(edge);
    else edgesByTarget.set(edge.toConceptId, [edge]);
  }
  for (const bucket of edgesByTarget.values()) {
    bucket.sort((a, b) => b.confidence - a.confidence);
  }

  return areas.map((area) => {
    const candidateEdges = edgesByTarget.get(area.conceptId);
    if (!candidateEdges || candidateEdges.length === 0) return area;

    for (const edge of candidateEdges) {
      const prereq = prereqByConceptId.get(edge.fromConceptId);
      const band: MasteryBand = prereq ? classifyBand(prereq, now) : 'untested';
      if (band === 'weak' || band === 'rusty' || band === 'untested') {
        return {
          ...area,
          upstreamGap: {
            conceptId: edge.fromConceptId,
            label: prereq?.label ?? edge.fromConceptId,
            band,
          },
        };
      }
    }

    return area;
  });
}
