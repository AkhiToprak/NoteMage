// Source-highlighting feature — the quote locator must survive the whitespace /
// case drift between the corpus the model read and the rendered source text.

import { describe, it, expect } from 'vitest';
import { locateQuote } from './source-highlight';

describe('locateQuote', () => {
  it('finds an exact substring and returns the original range', () => {
    const text = 'Mitochondria are the powerhouse of the cell.';
    const range = locateQuote(text, 'powerhouse of the cell');
    expect(range).not.toBeNull();
    expect(text.slice(range!.start, range!.end)).toBe('powerhouse of the cell');
  });

  it('is case-insensitive', () => {
    const text = 'Osmosis is the movement of water.';
    const range = locateQuote(text, 'OSMOSIS IS THE MOVEMENT');
    expect(range).not.toBeNull();
    expect(text.slice(range!.start, range!.end).toLowerCase()).toContain('osmosis is the movement');
  });

  it('collapses whitespace / newline drift between quote and source', () => {
    const text = 'The cell\n  membrane   is\tselectively permeable.';
    const range = locateQuote(text, 'The cell membrane is selectively permeable');
    expect(range).not.toBeNull();
    // The matched original span still starts at "The" and ends at "permeable".
    const slice = text.slice(range!.start, range!.end);
    expect(slice.startsWith('The cell')).toBe(true);
    expect(slice.trimEnd().endsWith('permeable')).toBe(true);
  });

  it('falls back to a prefix when the tail drifted', () => {
    const text = 'Photosynthesis converts light energy into chemical energy stored in glucose.';
    // Tail paraphrased; the 40-char prefix still anchors.
    const range = locateQuote(text, 'Photosynthesis converts light energy into ATP and heat instead');
    expect(range).not.toBeNull();
    expect(text.slice(range!.start, range!.end).toLowerCase()).toContain('photosynthesis converts light energy');
  });

  it('returns null when the quote is absent', () => {
    expect(locateQuote('A short body of text.', 'completely unrelated passage here')).toBeNull();
  });

  it('returns null for empty inputs', () => {
    expect(locateQuote('', 'x')).toBeNull();
    expect(locateQuote('x', '')).toBeNull();
  });
});
