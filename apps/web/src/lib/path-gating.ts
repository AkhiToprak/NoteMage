import type { GateStrategy } from '@prisma/client';
import { expectedActivityKinds } from './path-slot-activities';

// Phase 10.6 — real slot-based gate logic (replaces the Phase 10.1 stub
// that marked everything unlocked).
//
// Rules:
//   - A slot is `incompleteGeneration` iff it is missing one or more of
//     the activity kinds its `kind` should contain (AI generation failed
//     for some activity).
//   - A slot is `completed` iff it is NOT incompleteGeneration, every
//     activity is completed, and (for graded slots) `starsEarned >= 1`.
//   - A slot is "passable" iff it is `completed` OR `incompleteGeneration`
//     — passable slots never hold up the slots after them, so a failed
//     checkpoint can never trap the learner.
//   - A slot is `unlocked` iff every `prerequisiteSlotIds` entry is
//     passable AND every prior slot in flat path order is passable.
//   - A slot is `active` iff it's the first `unlocked && !completed &&
//     !incompleteGeneration` slot in path order.
//   - Phase `unlocked` mirrors "any slot in this phase is unlocked" so
//     legacy UI bits that read phase-level flags keep working.
//
// All `gateStrategy` values map to the same sequential semantics
// post-Phase 10.1 — the GateStrategy enum remains in the schema for
// backward compatibility but `path-gating` ignores it.

export interface ActivityLite {
  id: string;
  kind: string; // "theory" | "flashcards" | "quiz"
  completed: boolean;
  sortOrder: number;
}

export interface SlotLite {
  id: string;
  sortOrder: number;
  kind: string; // "learning" | "review" | "assessment"
  prerequisiteSlotIds: string[];
  starsEarned: number;
  // Activity kinds Stage B intentionally pruned (material too thin). Treated
  // as satisfied by the generation-completeness check, so a pruned kind is
  // NOT a failure. Optional so callers predating the field behave unchanged.
  prunedActivityKinds?: string[];
  activities: ActivityLite[];
}

export interface PhaseLite {
  id: string;
  sortOrder: number;
  gateStrategy: GateStrategy;
  slots: SlotLite[];
}

export type GateResult = { unlocked: boolean; reason?: string };

// ── helpers ────────────────────────────────────────────────────────

function sortPhases<P extends PhaseLite>(phases: P[]): P[] {
  return [...phases].sort((a, b) => a.sortOrder - b.sortOrder);
}

function sortSlots<S extends SlotLite>(slots: S[]): S[] {
  return [...slots].sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * A slot is generation-incomplete when it is missing one or more of the
 * activity kinds its `kind` should contain AND that kind was not
 * intentionally pruned — i.e. AI generation genuinely FAILED for some
 * activity. A kind Stage B pruned (material too thin to support it) counts
 * as satisfied, so a deliberately-tight slot reads as complete rather than
 * broken. Truly-incomplete slots never block the path and surface a
 * Regenerate affordance instead of trapping the learner.
 */
function isGenerationIncomplete(slot: SlotLite): boolean {
  const present = new Set(slot.activities.map((a) => a.kind));
  const pruned = new Set(slot.prunedActivityKinds ?? []);
  return expectedActivityKinds(slot.kind).some(
    (k) => !present.has(k) && !pruned.has(k),
  );
}

function isSlotCompleted(slot: SlotLite): boolean {
  // A slot missing generated content is surfaced as incompleteGeneration,
  // never as completed.
  if (isGenerationIncomplete(slot)) return false;
  if (!slot.activities.every((a) => a.completed)) return false;
  // Graded slots must also clear the 70% pass bar (1 star) before they
  // count as completed and unlock whatever comes next.
  if (
    (slot.kind === 'assessment' || slot.kind === 'final_exam') &&
    slot.starsEarned < 1
  ) {
    return false;
  }
  return true;
}

// ── annotated output types ─────────────────────────────────────────

export type AnnotatedActivity<A extends ActivityLite = ActivityLite> = A;

export type AnnotatedSlot<S extends SlotLite = SlotLite> = S & {
  unlocked: boolean;
  completed: boolean;
  /** Missing one or more expected activities — AI generation failed. */
  incompleteGeneration: boolean;
  isActive: boolean;
  activities: AnnotatedActivity<S['activities'][number]>[];
};

export interface AnnotatedPhase<P extends PhaseLite> {
  source: P;
  unlocked: boolean;
  unlockReason?: string;
  slots: AnnotatedSlot<P['slots'][number]>[];
}

// ── annotator ──────────────────────────────────────────────────────

/**
 * Annotate every phase + slot with `unlocked` / `completed` / `isActive`
 * flags. Walks slots in flat order (phase 0 slots → phase 1 slots → …)
 * so the "first incomplete, dependencies satisfied" pick is global.
 *
 * Pure function: same input → same output. The server uses this to
 * gate API writes (e.g. activity PATCH refuses to mark progress on a
 * locked slot) and the client uses it to render node state.
 */
export function annotatePhases<P extends PhaseLite>(phases: P[]): AnnotatedPhase<P>[] {
  const sortedPhases = sortPhases(phases);

  // First pass: per-slot completion + generation-incomplete (no deps).
  const phaseSlots = sortedPhases.map((phase) =>
    sortSlots(phase.slots).map((slot) => {
      const incompleteGeneration = isGenerationIncomplete(slot);
      const completed = isSlotCompleted(slot);
      return {
        slot,
        completed,
        incompleteGeneration,
        // A slot is "passable" — i.e. it doesn't hold up the slots after
        // it — once it's genuinely completed OR its generation failed.
        passable: completed || incompleteGeneration,
      };
    }),
  );

  // Flatten for the cross-phase sequential gate.
  const flat = phaseSlots.flat();
  const slotById = new Map(flat.map((s) => [s.slot.id, s]));

  // Second pass: compute unlocked + the single active slot.
  let firstActiveId: string | null = null;
  let priorBlockerHit = false;
  const unlockedById = new Map<string, boolean>();
  for (const { slot, completed, incompleteGeneration, passable } of flat) {
    const prereqsOk = slot.prerequisiteSlotIds.every((pid) => {
      const ref = slotById.get(pid);
      return ref ? ref.passable : true; // missing prereq id → treat as ok
    });
    const unlocked = !priorBlockerHit && prereqsOk;
    unlockedById.set(slot.id, unlocked);
    // The active node is the first genuinely-doable, not-done slot.
    // Generation-incomplete slots are skipped — they're flagged for
    // regeneration, not presented as the next lesson.
    if (!completed && !incompleteGeneration && firstActiveId === null && unlocked) {
      firstActiveId = slot.id;
    }
    // A normal incomplete slot blocks everything after it; a generation-
    // incomplete slot never does.
    if (!passable) priorBlockerHit = true;
  }

  return sortedPhases.map((phase, i) => {
    const slots = phaseSlots[i].map(({ slot, completed, incompleteGeneration }) => ({
      ...slot,
      unlocked: unlockedById.get(slot.id) ?? false,
      completed,
      incompleteGeneration,
      isActive: slot.id === firstActiveId,
    })) as AnnotatedSlot<P['slots'][number]>[];
    const phaseUnlocked = slots.some((s) => s.unlocked);
    const phaseReason =
      !phaseUnlocked && i > 0 ? 'previous_section_incomplete' : undefined;
    return {
      source: phase,
      unlocked: phaseUnlocked,
      unlockReason: phaseReason,
      slots,
    };
  });
}

// ── server-side helpers ─────────────────────────────────────────────

/**
 * Server-side check: is the slot identified by `slotId` currently
 * unlocked given the plan's phase tree? Used by the activity PATCH
 * and assessment POST endpoints to refuse writes on locked slots.
 */
export function isSlotUnlocked(phases: PhaseLite[], slotId: string): GateResult {
  const annotated = annotatePhases(phases);
  for (const phase of annotated) {
    for (const slot of phase.slots) {
      if (slot.id === slotId) {
        return slot.unlocked
          ? { unlocked: true }
          : { unlocked: false, reason: 'slot_locked' };
      }
    }
  }
  return { unlocked: false, reason: 'slot_not_found' };
}

/**
 * Map a quiz percentage to stars on a checkpoint assessment.
 *   1 star  ≥ 70%
 *   2 stars ≥ 85%
 *   3 stars ≥ 95%
 *   0 stars otherwise (slot is NOT considered passed)
 */
export function starsForPercentage(percentage: number): number {
  if (percentage >= 95) return 3;
  if (percentage >= 85) return 2;
  if (percentage >= 70) return 1;
  return 0;
}

/**
 * Letter-grade ladder for an assessment percentage. Adds finer granularity
 * than the 3-tier star system — A− vs A, B− vs B — without changing what
 * "passed" means (still ≥ 70%). Below 70% returns 'F'; the slot stays
 * unlocked-but-uncompleted and the learner retakes.
 */
export function gradeForPercentage(percentage: number): string {
  if (percentage >= 95) return 'A';
  if (percentage >= 90) return 'A-';
  if (percentage >= 85) return 'B';
  if (percentage >= 80) return 'B-';
  if (percentage >= 75) return 'C+';
  if (percentage >= 70) return 'C';
  return 'F';
}

/**
 * Coarser fallback: derive a letter grade from the star count alone. Used
 * when `bestPercentage` is null on legacy rows (rows written before the
 * grading feature shipped). Returns null when there are no stars yet.
 */
export function gradeFromStars(stars: number): string | null {
  if (stars >= 3) return 'A';
  if (stars >= 2) return 'B';
  if (stars >= 1) return 'C';
  return null;
}

/**
 * Pick the most precise grade we can render: prefer the percentage-derived
 * grade when `bestPercentage` is set, fall back to the star-derived grade
 * for legacy rows, and return null when the slot has no passing attempt.
 */
export function bestGrade(
  bestPercentage: number | null | undefined,
  starsEarned: number,
): string | null {
  if (typeof bestPercentage === 'number') return gradeForPercentage(bestPercentage);
  return gradeFromStars(starsEarned);
}

/**
 * Average `bestPercentage` across every graded slot (assessment + final_exam)
 * in a section that has been attempted at least once. Returns null when no
 * graded slot in the section has a recorded percentage — there's nothing to
 * average yet. Output is rounded to two decimal places to match the per-
 * attempt persistence step.
 */
export function sectionAverageGrade(
  slots: Array<{ kind: string; bestPercentage: number | null }>,
): { letter: string; percentage: number; count: number } | null {
  const graded = slots.filter(
    (s) =>
      (s.kind === 'assessment' || s.kind === 'final_exam') &&
      typeof s.bestPercentage === 'number',
  );
  if (graded.length === 0) return null;
  const sum = graded.reduce((acc, s) => acc + (s.bestPercentage as number), 0);
  const avg = Math.round((sum / graded.length) * 100) / 100;
  return { letter: gradeForPercentage(avg), percentage: avg, count: graded.length };
}
