import { describe, it, expect } from 'vitest';
import { jaccard, tier1Match, tokenize, type Tier1MatchCandidate } from './concept-dedup-match';
import { slugifyConceptKey } from './concept-write';

// ─── tokenize / jaccard ─────────────────────────────────────────────────

describe('tokenize', () => {
  it('lowercases, splits on non-alphanumeric runs, and drops stopwords', () => {
    expect(tokenize('Regular -ar Present Tense')).toEqual(
      new Set(['regular', 'ar', 'present', 'tense'])
    );
  });

  it('drops stopwords like "the"/"a"/"of"', () => {
    expect(tokenize('The Present Tense of -ar Verbs')).toEqual(
      new Set(['present', 'tense', 'ar', 'verbs'])
    );
  });
});

describe('jaccard', () => {
  it('is 1.0 for identical token sets', () => {
    const a = tokenize('present tense');
    expect(jaccard(a, a)).toBe(1);
  });

  it('is 0 for disjoint sets', () => {
    expect(jaccard(tokenize('present tense'), tokenize('past participle'))).toBe(0);
  });

  it('is 0 when both sets are empty', () => {
    expect(jaccard(new Set(), new Set())).toBe(0);
  });
});

// ─── tier1Match ─────────────────────────────────────────────────────────

function candidate(overrides: Partial<Tier1MatchCandidate> & { label: string }): Tier1MatchCandidate {
  return {
    id: `id-${overrides.label}`,
    key: slugifyConceptKey(overrides.label),
    canonicalId: null,
    ...overrides,
  };
}

describe('tier1Match', () => {
  it('matches on exact slug even when the label wording differs slightly', () => {
    const existing = [candidate({ id: 'concept-1', label: 'Regular -Ar Verbs' })];
    // Same slug as "Regular -Ar Verbs" after slugification (case differs).
    const result = tier1Match('regular -ar verbs', slugifyConceptKey('regular -ar verbs'), existing);
    expect(result).toBe('concept-1');
  });

  it('matches via Jaccard >= 0.8 on near-identical labels', () => {
    // "Regular -ar present tense" vs "Regular -ar present-tense verbs":
    // tokens: {regular, ar, present, tense} vs {regular, ar, present, tense, verbs}
    // intersection=4, union=5 -> jaccard = 0.8, clears the >=0.8 bar.
    const existing = [candidate({ id: 'concept-2', label: 'Regular -ar present tense' })];
    const newLabel = 'Regular -ar present-tense verbs';
    const result = tier1Match(newLabel, slugifyConceptKey(newLabel), existing);
    expect(result).toBe('concept-2');
  });

  it('returns null for a clear miss (low token overlap, different slug)', () => {
    const existing = [candidate({ id: 'concept-3', label: 'Past participle of -er verbs' })];
    const newLabel = 'Subjunctive mood triggers';
    const result = tier1Match(newLabel, slugifyConceptKey(newLabel), existing);
    expect(result).toBeNull();
  });

  it('chains through an existing canonicalId rather than returning the mid-chain id', () => {
    // concept-4 was itself already merged into concept-0 (the true root).
    const existing = [
      candidate({ id: 'concept-4', label: 'Regular -ar present tense', canonicalId: 'concept-0' }),
    ];
    const newLabel = 'Regular -ar present tense';
    const result = tier1Match(newLabel, slugifyConceptKey(newLabel), existing);
    expect(result).toBe('concept-0');
  });

  it('exact slug match takes priority over a Jaccard candidate elsewhere in the pool', () => {
    const existing = [
      candidate({ id: 'jaccard-hit', label: 'Regular -ar present tense verbs' }),
      candidate({ id: 'exact-hit', label: 'Some Concept' }),
    ];
    const newLabel = 'Some Concept';
    const result = tier1Match(newLabel, slugifyConceptKey(newLabel), existing);
    expect(result).toBe('exact-hit');
  });

  it('returns null when the candidate pool is empty', () => {
    expect(tier1Match('anything', slugifyConceptKey('anything'), [])).toBeNull();
  });
});
