// Path-gen Phase 8 (flag-gated PATH_LEARNING_BATCH, default OFF) — unit tests
// for the pure split/enable helpers. No network, no db, no process.env
// mutation needed (isLearningBatchEnabled takes the raw value as an arg).

import { describe, it, expect } from 'vitest';
import { isLearningBatchEnabled, splitLearningBatchPayload } from './path-learning-batch';

describe('isLearningBatchEnabled', () => {
  it('is true for the exact string "1"', () => {
    expect(isLearningBatchEnabled('1')).toBe(true);
  });

  it('is true for "1" with incidental surrounding whitespace (trimmed)', () => {
    expect(isLearningBatchEnabled(' 1 ')).toBe(true);
    expect(isLearningBatchEnabled('\t1\n')).toBe(true);
  });

  it('is false when unset', () => {
    expect(isLearningBatchEnabled(undefined)).toBe(false);
  });

  it('is false for the empty string', () => {
    expect(isLearningBatchEnabled('')).toBe(false);
  });

  it('is false for "0"', () => {
    expect(isLearningBatchEnabled('0')).toBe(false);
  });

  it('is false for truthy-looking but non-"1" values', () => {
    expect(isLearningBatchEnabled('true')).toBe(false);
    expect(isLearningBatchEnabled('yes')).toBe(false);
    expect(isLearningBatchEnabled('11')).toBe(false);
    expect(isLearningBatchEnabled('1.0')).toBe(false);
  });
});

describe('splitLearningBatchPayload', () => {
  it('splits a valid payload carrying both theory and flashcards objects', () => {
    const raw = { theory: { title: 'T' }, flashcards: { title: 'F', flashcards: [] } };
    expect(splitLearningBatchPayload(raw)).toEqual({
      theory: { title: 'T' },
      flashcards: { title: 'F', flashcards: [] },
    });
  });

  it('returns null when `theory` is missing', () => {
    expect(splitLearningBatchPayload({ flashcards: { title: 'F' } })).toBeNull();
  });

  it('returns null when `flashcards` is missing', () => {
    expect(splitLearningBatchPayload({ theory: { title: 'T' } })).toBeNull();
  });

  it('returns null when a present key is not an object (string)', () => {
    expect(splitLearningBatchPayload({ theory: 'nope', flashcards: {} })).toBeNull();
    expect(splitLearningBatchPayload({ theory: {}, flashcards: 'nope' })).toBeNull();
  });

  it('returns null when a present key is an array, not a plain object', () => {
    expect(splitLearningBatchPayload({ theory: [], flashcards: {} })).toBeNull();
    expect(splitLearningBatchPayload({ theory: {}, flashcards: [] })).toBeNull();
  });

  it('returns null for a present key that is null', () => {
    expect(splitLearningBatchPayload({ theory: null, flashcards: {} })).toBeNull();
  });

  it('returns null for null input', () => {
    expect(splitLearningBatchPayload(null)).toBeNull();
  });

  it('returns null for array input', () => {
    expect(splitLearningBatchPayload([])).toBeNull();
  });

  it('returns null for primitive input', () => {
    expect(splitLearningBatchPayload('not an object')).toBeNull();
    expect(splitLearningBatchPayload(42)).toBeNull();
    expect(splitLearningBatchPayload(undefined)).toBeNull();
  });
});
