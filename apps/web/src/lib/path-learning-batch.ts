// Path-gen Phase 8 (flag-gated PATH_LEARNING_BATCH, default ON since Phase 4
// cost pass) — pure helpers for the learning-slot theory+flashcards batching. No
// network, no db: this module only decides WHETHER to batch and HOW to split
// a batched tool payload back into the two shapes the existing unbatched
// theory/flashcards code already knows how to validate/normalize/persist.
// The actual call + fallback orchestration lives in path-generator.ts, which
// imports these; kept separate so both are unit-testable without touching
// process.env plumbing or any provider call (mirrors the split between
// path-generator-routing.ts's `parseStructureReasoningEffort` and its caller).

/**
 * Whether the learning-slot batching is turned on for this call. ON by DEFAULT
 * (Phase 4 cost pass — one call instead of two on every learning slot): unset
 * counts as enabled, so `PATH_LEARNING_BATCH` is now a kill-switch. Only the
 * explicit disable strings "0"/"false" (trimmed) turn it off; "1"/"true" (or
 * any other value) leave it on. The CALLER reads `process.env` at call time
 * (not module scope) so a toggle takes effect without a redeploy.
 */
export function isLearningBatchEnabled(raw: string | undefined): boolean {
  const v = raw?.trim().toLowerCase();
  return v !== '0' && v !== 'false';
}

/**
 * Split a `learning_slot_content` tool payload into its `theory` and
 * `flashcards` halves so each can be fed through the EXISTING
 * `normalizeTheoryInput` / `normalizeFlashcardsInput` + Zod validation the
 * unbatched path already uses — this function does no validation of its own,
 * it only decides whether the payload is shaped plausibly enough to attempt
 * the split at all. Returns `null` (never throws) for anything that isn't a
 * plain object carrying BOTH keys as objects — a missing/wrong-typed key at
 * this stage means the batched call didn't even hit the right shape, so the
 * caller should fall back to the unbatched two-call sequence rather than
 * hand a partial/malformed value further down the pipeline.
 */
export function splitLearningBatchPayload(
  raw: unknown,
): { theory: unknown; flashcards: unknown } | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const theory = obj.theory;
  const flashcards = obj.flashcards;
  if (theory === null || typeof theory !== 'object' || Array.isArray(theory)) return null;
  if (flashcards === null || typeof flashcards !== 'object' || Array.isArray(flashcards)) return null;
  return { theory, flashcards };
}
