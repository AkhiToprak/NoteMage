// Deterministic shuffle for quiz tokens. Same `key` → same shuffle output,
// so the learner sees a stable arrangement across remounts (navigation +
// back-button).
//
// Replaces the older `shuffleByKey` impls that used `hash("${key}:${i}")`
// as the sort key. That approach had a fatal bug: for token indices 0..9,
// only the last character of the hash input varied, and the polynomial
// hash produced monotonically increasing values — so sorting by hash kept
// the original order. Sentence-reorder / word-bank tokens came in correct
// order and the puzzle was already solved.
//
// New impl: hash the key once for a seed, then drive a Mulberry32 PRNG +
// Fisher-Yates shuffle. Deterministic, well-distributed, no monotonicity
// trap.

function hashKey(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let state = seed >>> 0;
  return function next(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffleByKey<T>(items: T[], key: string): T[] {
  const rng = mulberry32(hashKey(key));
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
