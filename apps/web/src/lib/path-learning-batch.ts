// Path-gen Phase 8 (flag-gated PATH_LEARNING_BATCH, default OFF) — pure
// helpers for the learning-slot theory+flashcards batching experiment. No
// network, no db: this module only decides WHETHER to batch and HOW to split
// a batched tool payload back into the two shapes the existing unbatched
// theory/flashcards code already knows how to validate/normalize/persist.
// The actual call + fallback orchestration lives in path-generator.ts, which
// imports these; kept separate so both are unit-testable without touching
// process.env plumbing or any provider call (mirrors the split between
// path-generator-routing.ts's `parseStructureReasoningEffort` and its caller).

/**
 * Whether the learning-slot batching experiment is turned on for this call.
 * Read from `process.env.PATH_LEARNING_BATCH` — the CALLER is responsible for
 * reading `process.env` at call time (not module scope), so a script or test
 * can toggle it per run. Trimmed so " 1 " with incidental whitespace still
 * counts; anything other than the exact string "1" (unset, "0", "true", …) is
 * off — matches the strict `=== '1'` idiom `parseStructureReasoningEffort`'s
 * sibling flags use elsewhere in this pipeline.
 */
export function isLearningBatchEnabled(raw: string | undefined): boolean {
  return raw?.trim() === '1';
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
