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
