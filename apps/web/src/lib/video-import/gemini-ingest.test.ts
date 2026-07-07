// L6 — the pre-flight USD estimate prices OUTPUT at the EXPECTED ~120-block
// count (VIDEO_INGEST_EST_OUTPUT_TOKENS ≈ 12k), not the 32k hard cap. Pricing at
// the cap over-estimated output cost and spuriously rejected borderline videos.
// The conservative INPUT term (audio billed at the higher rate) is unchanged.

import { describe, expect, it } from 'vitest';
import { estimateVideoIngestUsd } from './gemini-ingest';
import { COSTS } from '@/lib/path-generator-cost';

const MODEL = 'gemini-2.5-flash'; // rate card: input 0.3 / output 2.5 per M
const CEILING = 0.5; // getVideoIngestCostCeilingUsd default

// Sanity: the fixtures below assume this rate card is present.
if (!COSTS[MODEL]) throw new Error(`test fixture stale: no rate card for ${MODEL}`);

// Re-derive the OLD (output-at-cap) estimate so the "used to reject" assertion
// is grounded, not a magic number. Mirrors the function's input math.
function oldEstimateAtCap(durationSec: number): number {
  const rates = COSTS[MODEL];
  const totalInput = durationSec * 100; // low res tokens/sec
  const audioTokens = durationSec * 32;
  const frameTokens = totalInput - audioTokens;
  const audioRate = Math.max(rates.input, 1.0);
  const inputUsd = (frameTokens * rates.input + audioTokens * audioRate) / 1_000_000;
  const outputUsd = (32_768 * rates.output) / 1_000_000; // the retired cap term
  return inputUsd + outputUsd;
}

describe('estimateVideoIngestUsd (L6)', () => {
  // A borderline-length video: input + 12k output sits just under the ceiling,
  // but input + 32k output exceeded it under the old math.
  const borderlineSec = 8_500;

  it('a video that rejected at the cap-priced margin now passes', () => {
    expect(oldEstimateAtCap(borderlineSec)).toBeGreaterThan(CEILING); // old: rejected
    expect(estimateVideoIngestUsd(borderlineSec, 'low', MODEL)).toBeLessThan(CEILING); // now: passes
  });

  it('a genuinely long video still rejects', () => {
    // ~5h — the input term alone dwarfs any output-term reshuffle.
    expect(estimateVideoIngestUsd(18_000, 'low', MODEL)).toBeGreaterThan(CEILING);
  });

  it('lowering the output term reduces the estimate vs the old cap math', () => {
    expect(estimateVideoIngestUsd(borderlineSec, 'low', MODEL)).toBeLessThan(
      oldEstimateAtCap(borderlineSec),
    );
  });
});
