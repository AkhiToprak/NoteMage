// Phase 2 of plans/path-generation-reliability.md — gating must treat an
// intentionally PRUNED activity kind as satisfied (slot reads as complete),
// while a genuinely-absent (FAILED) kind still flags incompleteGeneration.

import { describe, it, expect } from 'vitest';
import {
  annotatePhases,
  isSlotUnlocked,
  starsForPercentage,
  gradeForPercentage,
  type PhaseLite,
  type SlotLite,
  type ActivityLite,
} from './path-gating';

function slot(over: Partial<SlotLite> & { id: string; kind: string }): SlotLite {
  return {
    sortOrder: 0,
    prerequisiteSlotIds: [],
    starsEarned: 0,
    activities: [],
    ...over,
  };
}

function phase(slots: SlotLite[]): PhaseLite {
  // gateStrategy is ignored by path-gating post-Phase-10.1; value is irrelevant.
  return {
    id: 'p1',
    sortOrder: 0,
    gateStrategy: 'SEQUENTIAL' as unknown as PhaseLite['gateStrategy'],
    slots,
  };
}

function annotateOne(s: SlotLite) {
  return annotatePhases([phase([s])])[0].slots[0];
}

describe('path-gating — pruned vs failed generation', () => {
  it('flags a learning slot with a genuinely missing activity as incompleteGeneration', () => {
    const s = annotateOne(
      slot({
        id: 's1',
        kind: 'learning', // expects theory + flashcards
        activities: [{ id: 'a1', kind: 'theory', completed: true, sortOrder: 0 }],
      }),
    );
    expect(s.incompleteGeneration).toBe(true);
    expect(s.completed).toBe(false);
  });

  it('does NOT flag a slot whose missing activity was intentionally pruned', () => {
    const s = annotateOne(
      slot({
        id: 's1',
        kind: 'learning',
        prunedActivityKinds: ['flashcards'],
        activities: [{ id: 'a1', kind: 'theory', completed: true, sortOrder: 0 }],
      }),
    );
    expect(s.incompleteGeneration).toBe(false);
    expect(s.completed).toBe(true);
  });

  it('treats a fully-generated slot as complete', () => {
    const s = annotateOne(
      slot({
        id: 's1',
        kind: 'learning',
        activities: [
          { id: 'a1', kind: 'theory', completed: true, sortOrder: 0 },
          { id: 'a2', kind: 'flashcards', completed: true, sortOrder: 1 },
        ],
      }),
    );
    expect(s.incompleteGeneration).toBe(false);
    expect(s.completed).toBe(true);
  });

  it('prunes only the named kind — the other expected kind is still required', () => {
    // review = flashcards + quiz. Prune quiz, flashcards present → complete.
    const pruned = annotateOne(
      slot({
        id: 's1',
        kind: 'review',
        prunedActivityKinds: ['quiz'],
        activities: [{ id: 'a1', kind: 'flashcards', completed: true, sortOrder: 0 }],
      }),
    );
    expect(pruned.incompleteGeneration).toBe(false);

    // Same slot, quiz absent but NOT pruned → still incomplete (failed).
    const failed = annotateOne(
      slot({
        id: 's2',
        kind: 'review',
        activities: [{ id: 'a1', kind: 'flashcards', completed: true, sortOrder: 0 }],
      }),
    );
    expect(failed.incompleteGeneration).toBe(true);
  });

  it('a pruned-complete slot does not block the slots after it', () => {
    const annotated = annotatePhases([
      phase([
        slot({
          id: 's1',
          kind: 'learning',
          prunedActivityKinds: ['flashcards'],
          activities: [{ id: 'a1', kind: 'theory', completed: true, sortOrder: 0 }],
        }),
        slot({
          id: 's2',
          sortOrder: 1,
          kind: 'learning',
          activities: [
            { id: 'b1', kind: 'theory', completed: false, sortOrder: 0 },
            { id: 'b2', kind: 'flashcards', completed: false, sortOrder: 1 },
          ],
        }),
      ]),
    ]);
    const s2 = annotated[0].slots[1];
    expect(s2.unlocked).toBe(true);
    expect(s2.isActive).toBe(true); // first doable, not-done slot
  });
});

// ── NM3-50: starsForPercentage / gradeForPercentage / isSlotUnlocked ──

function activity(
  id: string,
  kind: ActivityLite['kind'],
  completed: boolean,
  sortOrder = 0,
): ActivityLite {
  return { id, kind, completed, sortOrder };
}

function phaseWith(id: string, sortOrder: number, slots: SlotLite[]): PhaseLite {
  return {
    id,
    sortOrder,
    gateStrategy: 'sequential' as unknown as PhaseLite['gateStrategy'],
    slots,
  };
}

// A fully-completed learning slot (theory + flashcards present + done), so it
// counts as passable and unlocks whatever follows.
function completedLearningSlot(
  id: string,
  sortOrder: number,
  prerequisiteSlotIds: string[] = [],
): SlotLite {
  return slot({
    id,
    kind: 'learning',
    sortOrder,
    prerequisiteSlotIds,
    activities: [
      activity(`${id}-theory`, 'theory', true, 0),
      activity(`${id}-cards`, 'flashcards', true, 1),
    ],
  });
}

describe('starsForPercentage', () => {
  it('returns 0 below the 70% pass bar', () => {
    expect(starsForPercentage(0)).toBe(0);
    expect(starsForPercentage(69)).toBe(0);
    expect(starsForPercentage(69.9)).toBe(0);
  });

  it('returns 1 star at exactly 70% (the pass threshold)', () => {
    expect(starsForPercentage(70)).toBe(1);
  });

  it('returns 1 star in the [70, 85) band', () => {
    expect(starsForPercentage(70)).toBe(1);
    expect(starsForPercentage(84.9)).toBe(1);
  });

  it('returns 2 stars at exactly 85%', () => {
    expect(starsForPercentage(85)).toBe(2);
  });

  it('returns 2 stars in the [85, 95) band', () => {
    expect(starsForPercentage(85)).toBe(2);
    expect(starsForPercentage(94.9)).toBe(2);
  });

  it('returns 3 stars at exactly 95%', () => {
    expect(starsForPercentage(95)).toBe(3);
  });

  it('returns 3 stars above 95% (incl. a perfect score)', () => {
    expect(starsForPercentage(99)).toBe(3);
    expect(starsForPercentage(100)).toBe(3);
  });
});

describe('gradeForPercentage', () => {
  it('returns F below the 70% pass bar', () => {
    expect(gradeForPercentage(0)).toBe('F');
    expect(gradeForPercentage(69.9)).toBe('F');
  });

  it('maps each threshold band to its letter grade', () => {
    expect(gradeForPercentage(70)).toBe('C');
    expect(gradeForPercentage(74.9)).toBe('C');
    expect(gradeForPercentage(75)).toBe('C+');
    expect(gradeForPercentage(79.9)).toBe('C+');
    expect(gradeForPercentage(80)).toBe('B-');
    expect(gradeForPercentage(84.9)).toBe('B-');
    expect(gradeForPercentage(85)).toBe('B');
    expect(gradeForPercentage(89.9)).toBe('B');
    expect(gradeForPercentage(90)).toBe('A-');
    expect(gradeForPercentage(94.9)).toBe('A-');
    expect(gradeForPercentage(95)).toBe('A');
    expect(gradeForPercentage(100)).toBe('A');
  });
});

describe('isSlotUnlocked', () => {
  it('unlocks the very first slot in path order (no prerequisites)', () => {
    const target = slot({
      id: 'first',
      kind: 'learning',
      sortOrder: 0,
      activities: [
        activity('first-theory', 'theory', false),
        activity('first-cards', 'flashcards', false),
      ],
    });
    const phases = [phaseWith('p0', 0, [target])];
    expect(isSlotUnlocked(phases, 'first')).toEqual({ unlocked: true });
  });

  it('locks a later slot while its predecessor is incomplete', () => {
    const first = slot({
      id: 'first',
      kind: 'learning',
      sortOrder: 0,
      // theory done, flashcards NOT done → not passable → blocks.
      activities: [
        activity('first-theory', 'theory', true),
        activity('first-cards', 'flashcards', false),
      ],
    });
    const second = slot({
      id: 'second',
      kind: 'learning',
      sortOrder: 1,
      activities: [
        activity('second-theory', 'theory', false),
        activity('second-cards', 'flashcards', false),
      ],
    });
    const phases = [phaseWith('p0', 0, [first, second])];
    expect(isSlotUnlocked(phases, 'second')).toEqual({
      unlocked: false,
      reason: 'slot_locked',
    });
  });

  it('unlocks a later slot once its predecessor is fully completed', () => {
    const first = completedLearningSlot('first', 0);
    const second = slot({
      id: 'second',
      kind: 'learning',
      sortOrder: 1,
      activities: [
        activity('second-theory', 'theory', false),
        activity('second-cards', 'flashcards', false),
      ],
    });
    const phases = [phaseWith('p0', 0, [first, second])];
    expect(isSlotUnlocked(phases, 'second')).toEqual({ unlocked: true });
  });

  it('keeps the slot after a failed assessment (0 stars) locked', () => {
    // A completed-but-failed assessment (all activities done, starsEarned 0)
    // is NOT passable, so it blocks everything after it.
    const failedAssessment = slot({
      id: 'gate',
      kind: 'assessment',
      sortOrder: 0,
      starsEarned: 0,
      activities: [activity('gate-quiz', 'quiz', true)],
    });
    const after = slot({
      id: 'after',
      kind: 'learning',
      sortOrder: 1,
      activities: [
        activity('after-theory', 'theory', false),
        activity('after-cards', 'flashcards', false),
      ],
    });
    const phases = [phaseWith('p0', 0, [failedAssessment, after])];
    expect(isSlotUnlocked(phases, 'after')).toEqual({
      unlocked: false,
      reason: 'slot_locked',
    });
  });

  it('unlocks the slot after a passed assessment (>=1 star)', () => {
    const passedAssessment = slot({
      id: 'gate',
      kind: 'assessment',
      sortOrder: 0,
      starsEarned: 1,
      activities: [activity('gate-quiz', 'quiz', true)],
    });
    const after = slot({
      id: 'after',
      kind: 'learning',
      sortOrder: 1,
      activities: [
        activity('after-theory', 'theory', false),
        activity('after-cards', 'flashcards', false),
      ],
    });
    const phases = [phaseWith('p0', 0, [passedAssessment, after])];
    expect(isSlotUnlocked(phases, 'after')).toEqual({ unlocked: true });
  });

  it('treats a generation-incomplete predecessor as passable (never traps the learner)', () => {
    // A learning slot missing its flashcards activity is incompleteGeneration,
    // which is "passable" — so it must NOT block the slot after it.
    const broken = slot({
      id: 'broken',
      kind: 'learning',
      sortOrder: 0,
      activities: [activity('broken-theory', 'theory', true)], // flashcards missing
    });
    const after = slot({
      id: 'after',
      kind: 'learning',
      sortOrder: 1,
      activities: [
        activity('after-theory', 'theory', false),
        activity('after-cards', 'flashcards', false),
      ],
    });
    const phases = [phaseWith('p0', 0, [broken, after])];
    expect(isSlotUnlocked(phases, 'after')).toEqual({ unlocked: true });
  });

  it('honours explicit cross-phase prerequisiteSlotIds', () => {
    const dep = slot({
      id: 'dep',
      kind: 'learning',
      sortOrder: 0,
      activities: [
        activity('dep-theory', 'theory', true),
        activity('dep-cards', 'flashcards', false), // not complete → not passable
      ],
    });
    const dependent = slot({
      id: 'dependent',
      kind: 'learning',
      sortOrder: 0,
      prerequisiteSlotIds: ['dep'],
      activities: [
        activity('dependent-theory', 'theory', false),
        activity('dependent-cards', 'flashcards', false),
      ],
    });
    const phases = [phaseWith('p0', 0, [dep]), phaseWith('p1', 1, [dependent])];
    expect(isSlotUnlocked(phases, 'dependent')).toEqual({
      unlocked: false,
      reason: 'slot_locked',
    });
  });

  it('returns slot_not_found for an unknown slot id', () => {
    const phases = [phaseWith('p0', 0, [completedLearningSlot('first', 0)])];
    expect(isSlotUnlocked(phases, 'ghost')).toEqual({
      unlocked: false,
      reason: 'slot_not_found',
    });
  });
});
