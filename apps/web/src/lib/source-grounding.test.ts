import { describe, expect, it } from 'vitest';
import { normalizeGroundingText, sourceQuoteExists, verifiedSourceAnchor } from './source-grounding';

describe('source grounding', () => {
  const corpus = '### Lecture notes\nThe mitochondrion converts nutrients into usable cellular energy.';

  it('accepts verbatim quotes across harmless whitespace and quote-mark differences', () => {
    expect(
      sourceQuoteExists(corpus, 'The mitochondrion   converts nutrients into usable cellular energy.'),
    ).toBe(true);
    expect(normalizeGroundingText('“Cell”')).toBe('"cell"');
  });

  it('rejects plausible paraphrases that do not occur in the source', () => {
    expect(sourceQuoteExists(corpus, 'Mitochondria create energy for the cell.')).toBe(false);
  });

  it('returns null for malformed or fabricated anchors', () => {
    expect(verifiedSourceAnchor({ label: 'Lecture notes', quote: 'Mitochondria create ATP.' }, corpus)).toBeNull();
    expect(verifiedSourceAnchor({ label: 'Lecture notes', quote: 'The mitochondrion converts nutrients into usable cellular energy.' }, corpus)).toMatchObject({
      label: 'Lecture notes',
    });
  });
});
