/**
 * Weakness Training Phase 4.1a — tier-1 lexical concept-dedup matching (plan
 * `plans/weakness-training-phase4.md` §11.2 tier 1, §11.4 `tier1Match`).
 *
 * PURE module: no Prisma, no DB, no network — just the exact-slug / Jaccard
 * token-overlap matcher `persistSlotConcepts()` (`concept-write.ts`) calls
 * synchronously before creating a brand-new `Concept` row, plus the
 * tokenize/jaccard primitives 4.1b's tier-2 embedding matcher will reuse
 * (`concept-dedup.ts` is NOT this file — that owns the async embedding job;
 * this file only holds the free, synchronous lexical check and its shared
 * primitives).
 */

// ─── Tunables ───────────────────────────────────────────────────────────

/** Jaccard token-overlap threshold for a tier-1 match — deliberately
 *  conservative (plan §11.4: "false-merge worse than missed merge"). */
export const JACCARD_MATCH_THRESHOLD = 0.8;

/** Small stopword list dropped before tokenizing a label for Jaccard
 *  comparison — short connective words that would otherwise inflate overlap
 *  between genuinely different concepts (e.g. "the present tense" vs "the
 *  past tense" sharing only "the"). Deliberately small — this is a coarse
 *  lexical check, not a linguistic pipeline. */
const STOPWORDS = new Set([
  'a', 'an', 'and', 'as', 'at', 'by', 'for', 'in', 'is', 'it', 'of', 'on',
  'or', 'the', 'to', 'with',
]);

// ─── Candidate shape ────────────────────────────────────────────────────

/**
 * The minimal shape `tier1Match` needs for one existing canonical concept —
 * matches a `db.concept.findMany({ select: { id, key, label, canonicalId }
 * })` row.
 */
export interface Tier1MatchCandidate {
  id: string;
  key: string;
  label: string;
  /** Chained through so a match against an ALREADY-merged sibling still
   *  resolves to the true canonical id, never to a mid-chain pointer. */
  canonicalId: string | null;
}

// ─── Tokenize / Jaccard ─────────────────────────────────────────────────

/**
 * Lowercase, split on runs of non-alphanumeric characters, drop empty
 * tokens and stopwords. Pure — used identically by tier-1 (label vs label)
 * and, later, tier-2's embedding input prep.
 */
export function tokenize(label: string): Set<string> {
  const tokens = label
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0 && !STOPWORDS.has(t));
  return new Set(tokens);
}

/**
 * Jaccard similarity (|A ∩ B| / |A ∪ B|) between two token sets. Returns 0
 * when both sets are empty (nothing to compare — never a spurious match).
 */
export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const t of a) {
    if (b.has(t)) intersection += 1;
  }
  const union = a.size + b.size - intersection;
  if (union === 0) return 0;
  return intersection / union;
}

// ─── tier1Match ─────────────────────────────────────────────────────────

/**
 * Plan §11.4:
 * ```
 * tier1Match(newLabel, existingConcepts):
 *   slug = slugifyConceptKey(newLabel)
 *   exact = existingConcepts.find(c => c.key === slug)
 *   if exact: return exact.canonicalId ?? exact.id
 *   newTokens = tokenize(newLabel)
 *   for c in existingConcepts:
 *     if jaccard(newTokens, tokenize(c.label)) >= 0.8: return c.canonicalId ?? c.id
 *   return null
 * ```
 *
 * `newKey` is the caller's already-computed `slugifyConceptKey(newLabel)`
 * (passed in rather than recomputed here, since `persistSlotConcepts`
 * already has it on hand for the row it's about to create) — exact-slug
 * match takes priority over Jaccard, checked first. Both match kinds chain
 * through `candidate.canonicalId ?? candidate.id` so a hit against an
 * already-merged row still resolves to the true canonical concept, never a
 * mid-chain pointer (plan §11.4 "canonical identity is stable and
 * monotonic"). Returns `null` when nothing clears either bar — the caller
 * creates a genuinely new canonical concept.
 */
export function tier1Match(
  newLabel: string,
  newKey: string,
  existingConcepts: Tier1MatchCandidate[]
): string | null {
  const exact = existingConcepts.find((c) => c.key === newKey);
  if (exact) return exact.canonicalId ?? exact.id;

  const newTokens = tokenize(newLabel);
  if (newTokens.size === 0) return null;

  for (const c of existingConcepts) {
    if (jaccard(newTokens, tokenize(c.label)) >= JACCARD_MATCH_THRESHOLD) {
      return c.canonicalId ?? c.id;
    }
  }
  return null;
}
