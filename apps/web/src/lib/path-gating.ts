import type { GateStrategy } from '@prisma/client';

// Phase 10.6 — real slot-based gate logic (replaces the Phase 10.1 stub
// that marked everything unlocked).
//
// Rules:
//   - A slot is `completed` iff:
//       • it has at least one activity, and
//       • every activity is completed, and
//       • for `assessment`-kind slots, `starsEarned >= 1`.
//   - A slot is `unlocked` iff:
//       • every slot listed in its `prerequisiteSlotIds` is completed,
//         (an empty list means "no explicit prereqs"), AND
//       • every prior slot in path order (across the whole plan) is
//         completed. The sequential-between-slots gate is global so a
//         section's first slot is locked until the previous section's
//         last assessment is done.
//   - A slot is `active` iff it's the first `unlocked && !completed`
//     slot in path order.
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

function isSlotCompleted(slot: SlotLite): boolean {
  if (slot.activities.length === 0) return false;
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

  // First pass: compute completion per slot (no dependencies).
  const phaseSlots = sortedPhases.map((phase) =>
    sortSlots(phase.slots).map((slot) => ({
      slot,
      completed: isSlotCompleted(slot),
    })),
  );

  // Flatten for the cross-phase sequential gate.
  const flat: { slot: SlotLite; completed: boolean }[] = phaseSlots.flat();
  const slotById = new Map(flat.map((s) => [s.slot.id, s]));

  // Second pass: compute unlocked. A slot is unlocked iff
  // (a) every prior slot in flat order is completed, and
  // (b) every prerequisite slot id is completed.
  let firstIncompleteId: string | null = null;
  let priorIncompleteHit = false;
  const unlockedById = new Map<string, boolean>();
  for (const { slot, completed } of flat) {
    const prereqsOk = slot.prerequisiteSlotIds.every((pid) => {
      const ref = slotById.get(pid);
      return ref ? ref.completed : true; // missing prereq id → treat as ok
    });
    const unlocked = !priorIncompleteHit && prereqsOk;
    unlockedById.set(slot.id, unlocked);
    if (!completed && firstIncompleteId === null && unlocked) {
      firstIncompleteId = slot.id;
    }
    if (!completed) priorIncompleteHit = true;
  }

  return sortedPhases.map((phase, i) => {
    const slots = phaseSlots[i].map(({ slot, completed }) => ({
      ...slot,
      unlocked: unlockedById.get(slot.id) ?? false,
      completed,
      isActive: slot.id === firstIncompleteId,
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
