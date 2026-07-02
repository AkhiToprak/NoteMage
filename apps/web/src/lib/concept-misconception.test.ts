import { describe, it, expect } from 'vitest';
import {
  binomialUpperTailPValue,
  computeDominantDistractor,
  DOMINANT_FRACTION_THRESHOLD,
  MIN_WRONG_FOR_DOMINANT,
  SIGNIFICANCE_ALPHA,
} from './concept-misconception';

// ─── binomialUpperTailPValue ────────────────────────────────────────────

describe('binomialUpperTailPValue', () => {
  it('n=5,k=5,p=0.5 ≈ 0.03125 (all 5 coin flips heads)', () => {
    expect(binomialUpperTailPValue(5, 5, 0.5)).toBeCloseTo(0.03125, 5);
  });

  it('n=5,k=4,p=0.5 ≈ 0.1875 (P(X>=4) = P(X=4)+P(X=5))', () => {
    // P(X=4) = C(5,4)*0.5^5 = 5/32 = 0.15625; P(X=5) = 1/32 = 0.03125
    expect(binomialUpperTailPValue(4, 5, 0.5)).toBeCloseTo(0.1875, 5);
  });

  it('n=5,k=0,p=0.5 is 1 (P(X>=0) is certain)', () => {
    expect(binomialUpperTailPValue(0, 5, 0.5)).toBeCloseTo(1, 5);
  });

  it('is monotonically non-increasing in k for fixed n,p', () => {
    const pAtK2 = binomialUpperTailPValue(2, 10, 0.3);
    const pAtK5 = binomialUpperTailPValue(5, 10, 0.3);
    const pAtK8 = binomialUpperTailPValue(8, 10, 0.3);
    expect(pAtK2).toBeGreaterThanOrEqual(pAtK5);
    expect(pAtK5).toBeGreaterThanOrEqual(pAtK8);
  });

  it('guards n=0 → 0', () => {
    expect(binomialUpperTailPValue(0, 0, 0.5)).toBe(0);
    expect(binomialUpperTailPValue(3, 0, 0.5)).toBe(0);
  });

  it('k > n → 0 (impossible event)', () => {
    expect(binomialUpperTailPValue(6, 5, 0.5)).toBe(0);
  });

  it('a low chance baseline makes a dominant count far more significant', () => {
    // 5/5 wrong answers picking one option out of 4 (chance baseline 1/3)
    // should be much less likely under chance than under a coin-flip baseline.
    const pAtLowBaseline = binomialUpperTailPValue(5, 5, 1 / 3);
    const pAtCoinFlip = binomialUpperTailPValue(5, 5, 0.5);
    expect(pAtLowBaseline).toBeLessThan(pAtCoinFlip);
  });
});

// ─── computeDominantDistractor ──────────────────────────────────────────

describe('computeDominantDistractor', () => {
  it('(a) totalWrong < MIN_WRONG_FOR_DOMINANT (5) → null', () => {
    // 4 total wrong answers, all on option 1 — sample size alone disqualifies.
    const result = computeDominantDistractor({
      wrongCountsByOption: new Map([[1, 4]]),
      numOptions: 4,
    });
    expect(result).toBeNull();
  });

  it('(b) 5 wrongs all on one option, numOptions=4 (baseline 1/3) → hit with significant p', () => {
    const result = computeDominantDistractor({
      wrongCountsByOption: new Map([[2, 5]]),
      numOptions: 4,
    });
    expect(result).not.toBeNull();
    expect(result?.dominantOptionIndex).toBe(2);
    expect(result?.dominantCount).toBe(5);
    expect(result?.totalWrong).toBe(5);
    expect(result?.fraction).toBeCloseTo(1.0);
    expect(result?.chanceBaseline).toBeCloseTo(1 / 3);
    expect(result?.pValue).toBeLessThanOrEqual(SIGNIFICANCE_ALPHA);
  });

  it('(c) evenly split 2/2/2 across three wrong options → null (no >=60% dominant)', () => {
    const result = computeDominantDistractor({
      wrongCountsByOption: new Map([
        [0, 2],
        [1, 2],
        [2, 2],
      ]),
      numOptions: 4,
    });
    expect(result).toBeNull();
  });

  it('(d1) dominant fraction >=60% but n too small (below MIN_WRONG_FOR_DOMINANT) → null', () => {
    // 3 total wrong, 2 on one option = 66.7% fraction, but n=3 < 5.
    const result = computeDominantDistractor({
      wrongCountsByOption: new Map([
        [0, 2],
        [1, 1],
      ]),
      numOptions: 4,
    });
    expect(result).toBeNull();
  });

  it('(d2) dominant fraction >=60% at n>=5 but not significant enough → null', () => {
    // 10 total wrong, 6 on one option = 60% fraction (clears the threshold),
    // but against a high chance baseline (numOptions=2 -> baseline=1.0, i.e.
    // there is only one possible wrong option so it is never "dominant" in a
    // meaningful sense) the significance check should fail to clear the bar
    // in the other direction: use a baseline close to the observed fraction
    // so the binomial test cannot reject chance.
    const result = computeDominantDistractor({
      wrongCountsByOption: new Map([
        [0, 6],
        [1, 4],
      ]),
      // numOptions=3 -> chance baseline = 1/2 = 0.5, close to the observed
      // 60% share at n=10 -> not a significant departure from chance.
      numOptions: 3,
    });
    expect(result).toBeNull();
  });

  it('(e) numOptions=1 → null (no wrong-option space to be dominant over)', () => {
    const result = computeDominantDistractor({
      wrongCountsByOption: new Map([[0, 10]]),
      numOptions: 1,
    });
    expect(result).toBeNull();
  });

  it('accepts a plain Record in addition to a Map', () => {
    const result = computeDominantDistractor({
      wrongCountsByOption: { 3: 5 },
      numOptions: 4,
    });
    expect(result).not.toBeNull();
    expect(result?.dominantOptionIndex).toBe(3);
  });

  it('hits exactly at the fraction threshold when n is large enough for significance', () => {
    // 15 total, split 9/6 -> fraction 0.6 exactly (clears DOMINANT_FRACTION_THRESHOLD)
    // AND n=15 is large enough that 60% vs. a 1/3 chance baseline is significant
    // (p ~= 0.031, below SIGNIFICANCE_ALPHA) — unlike the n=5 case in test (d2)
    // above, which has the same 60% fraction but fails the significance bar.
    const result = computeDominantDistractor({
      wrongCountsByOption: new Map([
        [0, 9],
        [1, 6],
      ]),
      numOptions: 4,
    });
    expect(result).not.toBeNull();
    expect(result?.fraction).toBeCloseTo(DOMINANT_FRACTION_THRESHOLD);
    expect(result?.pValue).toBeLessThanOrEqual(SIGNIFICANCE_ALPHA);
  });

  it('sanity: MIN_WRONG_FOR_DOMINANT and DOMINANT_FRACTION_THRESHOLD constants match plan §2.3', () => {
    expect(MIN_WRONG_FOR_DOMINANT).toBe(5);
    expect(DOMINANT_FRACTION_THRESHOLD).toBeCloseTo(0.6);
  });
});
