// Phase 2 of plans/path-generation-reliability.md — gating must treat an
// intentionally PRUNED activity kind as satisfied (slot reads as complete),
// while a genuinely-absent (FAILED) kind still flags incompleteGeneration.

import { describe, it, expect } from 'vitest';
import { annotatePhases, type PhaseLite, type SlotLite } from './path-gating';

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
