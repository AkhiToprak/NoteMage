import type { PathPlan, PathSlot } from '@/components/learn/PathView';

// Path-scoped progress stats. Drives the per-path overview on /my-path:
// readiness, checkpoint counts, per-section topic mastery, and weak
// checkpoints. The dashboard's aggregate "Overview" (StudyStats) sums these
// across every path, so this stays the single source of slot accounting.
//
// Readiness formula: lesson completion 0.40 + quiz average 0.30, renormalized
// over the components we actually track.

/** Pass gate for graded checkpoints — a boss/assessment below this is "weak". */
const PASS_GATE = 70;

export interface PathTopicMastery {
  /** Phase / section title. */
  title: string;
  /** 0–100 completion of the section's checkpoints. */
  pct: number;
}

export interface PathWeakCheckpoint {
  title: string;
  /** Best score on the graded checkpoint (0–100). */
  pct: number;
}

export interface PathOverviewStats {
  totalCheckpoints: number;
  doneCheckpoints: number;
  /** 0–100 checkpoint completion. */
  progressPct: number;
  /** Number of phases/sections in the path. */
  sections: number;
  lessonsCompleted: number;
  quizzesTaken: number;
  bossTestsPassed: number;
  starsEarned: number;
  /** Lesson/review slot completion (0–100). Drives 40% of readiness. */
  lessonCompletionPct: number;
  /** Average best score across completed graded slots (0–100), or null. */
  quizAveragePct: number | null;
  /** Renormalized readiness (0–100). */
  readiness: number;
  /** Per-section mastery rows, in path order. */
  topics: PathTopicMastery[];
  /** Lowest-progress incomplete section title, or null. */
  weakTopicName: string | null;
  /** Completed graded checkpoints scoring below the pass gate. */
  weakCheckpoints: PathWeakCheckpoint[];
}

export function derivePathStats(plan: PathPlan): PathOverviewStats {
  let totalCheckpoints = 0;
  let doneCheckpoints = 0;
  let lessonSlotsTotal = 0;
  let lessonSlotsDone = 0;
  let quizScoreSum = 0;
  let quizScoreCount = 0;
  let lessonsCompleted = 0;
  let quizzesTaken = 0;
  let bossTestsPassed = 0;
  let starsEarned = 0;

  const topics: PathTopicMastery[] = [];
  const weakCheckpoints: PathWeakCheckpoint[] = [];

  for (const phase of plan.phases) {
    let phaseTotal = 0;
    let phaseDone = 0;

    for (const slot of phase.slots as (PathSlot & { bestPercentage?: number | null })[]) {
      totalCheckpoints += 1;
      phaseTotal += 1;
      if (slot.completed) {
        doneCheckpoints += 1;
        phaseDone += 1;
      }
      starsEarned += slot.starsEarned ?? 0;

      const isLearning = slot.kind === 'learning' || slot.kind === 'review';
      const isAssessment = slot.kind === 'assessment' || slot.kind === 'final_exam';

      if (isLearning) {
        lessonSlotsTotal += 1;
        if (slot.completed) {
          lessonSlotsDone += 1;
          lessonsCompleted += 1;
        }
      }

      if (isAssessment) {
        if (slot.completed) quizzesTaken += 1;
        if (slot.completed && slot.bestPercentage !== null && slot.bestPercentage !== undefined) {
          quizScoreSum += slot.bestPercentage;
          quizScoreCount += 1;
          if (slot.bestPercentage >= PASS_GATE) {
            bossTestsPassed += 1;
          } else {
            weakCheckpoints.push({ title: slot.title, pct: Math.round(slot.bestPercentage) });
          }
        }
      }
    }

    topics.push({
      title: phase.title,
      pct: phaseTotal > 0 ? Math.round((phaseDone / phaseTotal) * 100) : 0,
    });
  }

  const lessonCompletionPct = lessonSlotsTotal > 0 ? (lessonSlotsDone / lessonSlotsTotal) * 100 : 0;
  const quizAveragePct = quizScoreCount > 0 ? quizScoreSum / quizScoreCount : null;

  // Renormalized readiness — see file header.
  let readiness = 0;
  if (quizAveragePct !== null) {
    readiness = (0.4 * lessonCompletionPct + 0.3 * quizAveragePct) / 0.7;
  } else if (lessonSlotsTotal > 0) {
    readiness = lessonCompletionPct;
  }
  readiness = Math.min(100, Math.max(0, Math.round(readiness)));

  const incomplete = topics.filter((t) => t.pct < 100);
  const weakTopicName =
    incomplete.length > 0 ? incomplete.reduce((a, b) => (a.pct <= b.pct ? a : b)).title : null;

  const progressPct =
    totalCheckpoints > 0 ? Math.round((doneCheckpoints / totalCheckpoints) * 100) : 0;

  return {
    totalCheckpoints,
    doneCheckpoints,
    progressPct,
    sections: plan.phases.length,
    lessonsCompleted,
    quizzesTaken,
    bossTestsPassed,
    starsEarned,
    lessonCompletionPct,
    quizAveragePct,
    readiness,
    topics,
    weakTopicName,
    weakCheckpoints,
  };
}

/** Find the checkpoint the learner should resume at: the first unlocked,
 *  not-yet-completed slot in path order. Null when everything is done. */
export function findContinueSlot(plan: PathPlan): PathSlot | null {
  for (const phase of plan.phases) {
    for (const slot of phase.slots) {
      // Skip still-generating slots — they have no content to study yet, so
      // they're never a valid "continue here" target while a build is in flight.
      if (slot.unlocked && !slot.completed && !slot.generating) return slot;
    }
  }
  return null;
}

