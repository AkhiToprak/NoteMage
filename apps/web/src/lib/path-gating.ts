import type { GateStrategy } from '@prisma/client';

// Phase 10.1 — Slot-based gating stub. Pure functions, no I/O. Same input →
// same output. The real implementation (sequential gates between slots,
// prerequisite checks, assessment-stars threshold) lands in Phase 10.6.
//
// For now annotatePhases marks every phase + slot as unlocked. `completed` is
// derived from each slot's activities so the path UI can still show stars
// and the first-incomplete slot as "active" without waiting on the full
// gate.

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

function sortPhases<P extends PhaseLite>(phases: P[]): P[] {
  return [...phases].sort((a, b) => a.sortOrder - b.sortOrder);
}

function sortSlots<S extends SlotLite>(slots: S[]): S[] {
  return [...slots].sort((a, b) => a.sortOrder - b.sortOrder);
}

function isSlotCompleted(slot: SlotLite): boolean {
  if (slot.activities.length === 0) return false;
  return slot.activities.every((a) => a.completed);
}

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

/**
 * Phase 10.1 stub annotator. Returns every phase and slot as `unlocked: true`
 * and computes `completed` from per-activity flags. The first incomplete slot
 * (across all phases, in sort order) is marked `isActive`.
 *
 * Phase 10.6 will replace this with the real gate logic:
 * - Phase 0 unlocked. Subsequent phases unlocked once every slot in the prior
 *   phase is completed.
 * - Slot unlocked iff every slot in `prerequisiteSlotIds` is completed.
 * - Assessment-kind slots additionally require `starsEarned >= 1` to count
 *   as completed.
 */
export function annotatePhases<P extends PhaseLite>(phases: P[]): AnnotatedPhase<P>[] {
  const sortedPhases = sortPhases(phases);

  // First pass: compute per-slot completion so we can pick `isActive` in a
  // second pass over the flat list.
  const phaseSlots = sortedPhases.map((phase) =>
    sortSlots(phase.slots).map((slot) => ({ slot, completed: isSlotCompleted(slot) })),
  );

  const flatSlots = phaseSlots.flat();
  const firstIncompleteId = flatSlots.find((s) => !s.completed)?.slot.id ?? null;

  return sortedPhases.map((phase, i) => ({
    source: phase,
    unlocked: true,
    slots: phaseSlots[i].map(({ slot, completed }) => ({
      ...slot,
      unlocked: true,
      completed,
      isActive: slot.id === firstIncompleteId,
    })) as AnnotatedSlot<P['slots'][number]>[],
  }));
}
