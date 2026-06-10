// Phase 3 of plans/path-generation-reliability.md — the prune-vs-fail
// discriminator. Thin theory legitimately yields no flashcards (prune); a
// review slot has no theory evidence, so empty cards there are a failure.

import { describe, it, expect } from 'vitest';
import {
  expectedActivityKinds,
  isTheoryTooThinForFlashcards,
  MIN_THEORY_WORDS_FOR_FLASHCARDS,
} from './path-slot-activities';

const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(' ');

describe('expectedActivityKinds', () => {
  it('maps each slot kind to its expected activities', () => {
    expect(expectedActivityKinds('learning')).toEqual(['theory', 'flashcards']);
    expect(expectedActivityKinds('review')).toEqual(['flashcards', 'quiz']);
    expect(expectedActivityKinds('assessment')).toEqual(['quiz']);
    expect(expectedActivityKinds('final_exam')).toEqual(['quiz']);
  });
});

describe('isTheoryTooThinForFlashcards', () => {
  it('treats missing/empty theory as NOT thin (no evidence → fail, not prune)', () => {
    expect(isTheoryTooThinForFlashcards(undefined)).toBe(false);
    expect(isTheoryTooThinForFlashcards(null)).toBe(false);
    expect(isTheoryTooThinForFlashcards('')).toBe(false);
    expect(isTheoryTooThinForFlashcards('   ')).toBe(false);
  });

  it('flags a sub-threshold stub as thin', () => {
    expect(isTheoryTooThinForFlashcards(words(MIN_THEORY_WORDS_FOR_FLASHCARDS - 1))).toBe(true);
  });

  it('does not flag substantial theory as thin', () => {
    expect(isTheoryTooThinForFlashcards(words(MIN_THEORY_WORDS_FOR_FLASHCARDS + 20))).toBe(false);
  });

  it('is "< threshold" — exactly the threshold count is NOT thin', () => {
    const exactly = Array.from({ length: MIN_THEORY_WORDS_FOR_FLASHCARDS }, (_, i) => `w${i}`).join(
      '  \n ',
    );
    expect(isTheoryTooThinForFlashcards(exactly)).toBe(false);
  });
});
