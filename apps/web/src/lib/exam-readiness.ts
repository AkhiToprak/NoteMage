/**
 * Mage Revolution Phase 5 — exam / cross-path readiness aggregation.
 *
 * `deriveExamReadiness` is a PURE function (no `db`, no I/O) that rolls a set of
 * scoped study materials into a single 0–100 readiness number plus a ranked list
 * of weak topics. The db-backed loading (resolving an exam's `ExamScopeItem`s
 * into these slim inputs, running `derivePathStats` per path, reading best quiz
 * attempts) lives in `exam-scope.ts`, so this layer stays trivially unit-testable
 * — mirroring the `quiz-grading` / `mage-context` split.
 *
 * Two correctness invariants the tests pin down (see `exam-readiness.test.ts`):
 *  1. A never-attempted graded item counts as **0%** — it is in scope, so it
 *     drags readiness down rather than being silently excluded.
 *  2. A quiz set scoped BOTH directly AND via a scoped path is counted **once**
 *     (via the path, whose `derivePathStats` already accounts for it) — never
 *     double-counted.
 */

/** Below this, a graded item is "weak" and surfaces in `weakTopics`. */
export const READINESS_PASS_GATE = 70;

/** Per-item weight for passive (ungraded) material — deliberately small so
 *  notes/docs nudge readiness without dominating graded practice. */
export const PASSIVE_ITEM_WEIGHT = 2;

/** Cap on the ranked weak-topic list fed to the UI + the study-state block. */
export const MAX_WEAK_TOPICS = 8;

/** Every kind of thing an exam can scope. */
export type ExamScopeItemType =
  | 'path'
  | 'quiz_set'
  | 'flashcard_set'
  | 'page'
  | 'document'
  | 'section';

/** Ungraded scope kinds — material the learner has, but can't be scored on. */
export type ExamPassiveItemType = 'flashcard_set' | 'page' | 'document' | 'section';

/**
 * A scoped learning path, pre-reduced from `derivePathStats`. Only the fields
 * the rollup needs ride here, so tests construct fixtures trivially and the
 * aggregator stays decoupled from the full `PathPlan` shape.
 */
export interface ExamPathReadiness {
  id: string;
  title: string;
  /** 0–100 path readiness from `derivePathStats(plan).readiness`. */
  readiness: number;
  /** Total checkpoints — the path's relative weight in the aggregate. */
  totalCheckpoints: number;
  /** Completed checkpoints — distinguishes a touched path from an untouched one. */
  doneCheckpoints: number;
  /** Graded checkpoints below the pass gate, from `derivePathStats`. */
  weakCheckpoints: { title: string; pct: number }[];
}

/**
 * A directly-scoped quiz set with its best attempt. `bestPercentage === null`
 * means never attempted → counts as 0. `sourcePathId` is the dedup key: if it
 * points at a scoped path, this set is dropped (already counted via the path).
 */
export interface ExamQuizReadiness {
  id: string;
  title: string;
  questionCount: number;
  bestPercentage: number | null;
  sourcePathId: string | null;
}

/** A passive (ungraded) scope item — flashcards, a page, a document, a section. */
export interface ExamPassiveItem {
  type: ExamPassiveItemType;
  id: string;
  title: string;
}

export interface ExamReadinessInput {
  paths: ExamPathReadiness[];
  quizSets: ExamQuizReadiness[];
  passive: ExamPassiveItem[];
}

/** One resolved scope item with its computed contribution. */
export interface ExamReadinessItem {
  type: ExamScopeItemType;
  id: string;
  title: string;
  /** 0–100 mastery on this item (0 for never-attempted / passive). */
  score: number;
  /** Relative weight in the aggregate. */
  weight: number;
  /** False for never-attempted graded items and all passive material. */
  attempted: boolean;
  /** True for ungraded (passive) material. */
  passive: boolean;
}

/** A weak topic, with a back-pointer so the UI can deep-link to it. */
export interface ExamReadinessWeakTopic {
  title: string;
  pct: number;
  source: { type: 'path' | 'quiz_set'; id: string };
}

export interface ExamReadiness {
  /** 0–100 weighted readiness across all scoped, deduped material. */
  readiness: number;
  /** True once any graded material (path or quiz) is in scope. */
  hasGradedMaterial: boolean;
  /** True when nothing is scoped at all. */
  isEmpty: boolean;
  /** Per-item rows (deduped), graded first then passive, in input order. */
  items: ExamReadinessItem[];
  /** Lowest-scoring graded topics/checkpoints, ascending, capped. */
  weakTopics: ExamReadinessWeakTopic[];
  counts: {
    /** Scoped paths. */
    paths: number;
    /** Scoped quiz sets AFTER dedup against scoped paths. */
    quizSets: number;
    /** Passive items. */
    passive: number;
  };
}

function clampPct(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

/**
 * Roll scoped material into a single readiness number + ranked weak topics.
 * Pure; safe to call from a route, a grounding loader, or a test.
 */
export function deriveExamReadiness(input: ExamReadinessInput): ExamReadiness {
  const paths = input.paths ?? [];
  const quizSets = input.quizSets ?? [];
  const passive = input.passive ?? [];

  const scopedPathIds = new Set(paths.map((p) => p.id));

  const items: ExamReadinessItem[] = [];
  const weak: ExamReadinessWeakTopic[] = [];
  let weightedScore = 0;
  let totalWeight = 0;

  // ── Paths ── weight ∝ checkpoint count so a big syllabus outweighs a stub.
  for (const p of paths) {
    const score = clampPct(p.readiness);
    const weight = Math.max(1, p.totalCheckpoints);
    items.push({
      type: 'path',
      id: p.id,
      title: p.title,
      score,
      weight,
      attempted: p.doneCheckpoints > 0,
      passive: false,
    });
    weightedScore += score * weight;
    totalWeight += weight;
    for (const wc of p.weakCheckpoints ?? []) {
      weak.push({ title: wc.title, pct: clampPct(wc.pct), source: { type: 'path', id: p.id } });
    }
  }

  // ── Quiz sets ── dedup against scoped paths, then weight ∝ question count.
  let countedQuizSets = 0;
  for (const q of quizSets) {
    // Already counted inside a scoped path — skip to avoid double counting.
    if (q.sourcePathId && scopedPathIds.has(q.sourcePathId)) continue;
    countedQuizSets += 1;
    const attempted = q.bestPercentage !== null && q.bestPercentage !== undefined;
    const score = attempted ? clampPct(q.bestPercentage as number) : 0; // never-attempted → 0
    const weight = Math.max(1, q.questionCount);
    items.push({
      type: 'quiz_set',
      id: q.id,
      title: q.title,
      score,
      weight,
      attempted,
      passive: false,
    });
    weightedScore += score * weight;
    totalWeight += weight;
    if (score < READINESS_PASS_GATE) {
      weak.push({ title: q.title, pct: score, source: { type: 'quiz_set', id: q.id } });
    }
  }

  // ── Passive material ── small fixed weight, no graded score.
  for (const m of passive) {
    const weight = PASSIVE_ITEM_WEIGHT;
    items.push({
      type: m.type,
      id: m.id,
      title: m.title,
      score: 0,
      weight,
      attempted: false,
      passive: true,
    });
    weightedScore += 0 * weight;
    totalWeight += weight;
  }

  const gradedItems = paths.length + countedQuizSets;
  const readiness = totalWeight > 0 ? clampPct(weightedScore / totalWeight) : 0;
  const weakTopics = weak.sort((a, b) => a.pct - b.pct).slice(0, MAX_WEAK_TOPICS);

  return {
    readiness,
    hasGradedMaterial: gradedItems > 0,
    isEmpty: items.length === 0,
    items,
    weakTopics,
    counts: {
      paths: paths.length,
      quizSets: countedQuizSets,
      passive: passive.length,
    },
  };
}

// ─── Weak areas (Exam Mode Phase 2) ──────────────────────────────────────────
//
// The Exam Path hub surfaces a CAPPED ({@link MAX_WEAK_TOPICS}) preview of weak
// topics. The dedicated `/exam/[id]/weak-areas` dashboard needs the FULL set,
// grouped by severity and ranked by how much readiness each one is costing —
// so it derives from the same raw {@link ExamReadinessInput}, not the capped
// {@link ExamReadiness.weakTopics}. Kept pure (no I/O) and weighting-consistent
// with `deriveExamReadiness` so impact numbers are HONEST: a weak area's
// `impactPoints` is exactly the readiness it is dragging off the aggregate vs.
// the pass gate, on the same 0–100 scale the ring shows. No fabricated metrics.

/** Severity band for a weak area, from current mastery vs. the pass gate. */
export type WeakAreaBand = 'urgent' | 'needs_practice' | 'almost_fixed';

/** Relative priority of a weak area, banded against the worst offender. */
export type WeakAreaImpact = 'high' | 'medium' | 'low';

/** mastery < this → urgent. */
export const WEAK_URGENT_BELOW = 50;
/** urgent ≤ mastery < this → needs_practice; the remainder (< gate) → almost_fixed. */
export const WEAK_NEEDS_BELOW = 65;

export interface WeakArea {
  /** Stable key for React lists + client title→slot matching. */
  key: string;
  title: string;
  /** 0–100 current mastery on this topic. */
  mastery: number;
  band: WeakAreaBand;
  /** Origin, so the UI can drill (path → its exam mission, quiz → the set). */
  sourceType: 'path' | 'quiz_set';
  sourceId: string;
  /**
   * Readiness points (0–100 scale) this topic is costing the aggregate vs. the
   * pass gate = gap × the topic's weight share. May be fractional; the UI rounds.
   */
  impactPoints: number;
  /** `impactPoints` banded relative to the worst weak area in this exam. */
  impact: WeakAreaImpact;
}

export interface WeakAreasResult {
  /** Mirror of the rollup so the dashboard header needn't double-fetch. */
  readiness: number;
  hasGradedMaterial: boolean;
  /** True once any graded material has actually been attempted (vs. just scoped). */
  attempted: boolean;
  /** Σ impactPoints — readiness recoverable by clearing every weak area. */
  recoverablePoints: number;
  /** Weak areas, ranked by impact (desc), then mastery (asc). */
  areas: WeakArea[];
  counts: { urgent: number; needs_practice: number; almost_fixed: number; total: number };
}

function bandFor(mastery: number): WeakAreaBand {
  if (mastery < WEAK_URGENT_BELOW) return 'urgent';
  if (mastery < WEAK_NEEDS_BELOW) return 'needs_practice';
  return 'almost_fixed';
}

function slug(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
}

/**
 * Group an exam's scoped material into ranked weak areas for the weak-areas
 * dashboard. Mirrors `deriveExamReadiness`'s dedup + weighting so each area's
 * `impactPoints` is the genuine readiness it costs — never an invented figure.
 */
export function deriveWeakAreas(input: ExamReadinessInput): WeakAreasResult {
  const paths = input.paths ?? [];
  const quizSets = input.quizSets ?? [];
  const passive = input.passive ?? [];

  const scopedPathIds = new Set(paths.map((p) => p.id));

  // Total weight — identical to deriveExamReadiness so shares are consistent.
  let totalWeight = 0;
  for (const p of paths) totalWeight += Math.max(1, p.totalCheckpoints);
  for (const q of quizSets) {
    if (q.sourcePathId && scopedPathIds.has(q.sourcePathId)) continue;
    totalWeight += Math.max(1, q.questionCount);
  }
  totalWeight += passive.length * PASSIVE_ITEM_WEIGHT;
  const denom = totalWeight > 0 ? totalWeight : 1;

  const raw: Omit<WeakArea, 'impact'>[] = [];
  let attempted = false;

  // ── Paths ── each weak checkpoint is one ~1-weight unit of its path.
  for (const p of paths) {
    if (p.doneCheckpoints > 0) attempted = true;
    const pathWeight = Math.max(1, p.totalCheckpoints);
    const perCheckpoint = pathWeight / Math.max(1, p.totalCheckpoints); // ≈ 1
    for (const wc of p.weakCheckpoints ?? []) {
      const mastery = clampPct(wc.pct);
      if (mastery >= READINESS_PASS_GATE) continue;
      const impactPoints = ((READINESS_PASS_GATE - mastery) * perCheckpoint) / denom;
      raw.push({
        key: `path:${p.id}:${raw.length}:${slug(wc.title)}`,
        title: wc.title,
        mastery,
        band: bandFor(mastery),
        sourceType: 'path',
        sourceId: p.id,
        impactPoints,
      });
    }
  }

  // ── Quiz sets ── dedup against scoped paths; a weak set is one weak area.
  for (const q of quizSets) {
    if (q.sourcePathId && scopedPathIds.has(q.sourcePathId)) continue;
    const isAttempted = q.bestPercentage !== null && q.bestPercentage !== undefined;
    if (isAttempted) attempted = true;
    const mastery = isAttempted ? clampPct(q.bestPercentage as number) : 0;
    if (mastery >= READINESS_PASS_GATE) continue;
    const weight = Math.max(1, q.questionCount);
    const impactPoints = ((READINESS_PASS_GATE - mastery) * weight) / denom;
    raw.push({
      key: `quiz_set:${q.id}:${raw.length}:${slug(q.title)}`,
      title: q.title,
      mastery,
      band: bandFor(mastery),
      sourceType: 'quiz_set',
      sourceId: q.id,
      impactPoints,
    });
  }

  const maxImpact = raw.reduce((m, a) => Math.max(m, a.impactPoints), 0);
  const areas: WeakArea[] = raw
    .map((a) => {
      const ratio = maxImpact > 0 ? a.impactPoints / maxImpact : 0;
      const impact: WeakAreaImpact = ratio >= 0.6 ? 'high' : ratio >= 0.3 ? 'medium' : 'low';
      return { ...a, impact };
    })
    .sort((a, b) => b.impactPoints - a.impactPoints || a.mastery - b.mastery);

  const counts = {
    urgent: areas.filter((a) => a.band === 'urgent').length,
    needs_practice: areas.filter((a) => a.band === 'needs_practice').length,
    almost_fixed: areas.filter((a) => a.band === 'almost_fixed').length,
    total: areas.length,
  };

  const recoverablePoints = areas.reduce((s, a) => s + a.impactPoints, 0);
  const gradedItems = paths.length + quizSets.filter((q) => !(q.sourcePathId && scopedPathIds.has(q.sourcePathId))).length;

  return {
    readiness: deriveExamReadiness(input).readiness,
    hasGradedMaterial: gradedItems > 0,
    attempted,
    recoverablePoints,
    areas,
    counts,
  };
}
