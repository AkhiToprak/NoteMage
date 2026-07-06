/**
 * Runtime feature flags read from the server environment at call time (not
 * memoised at module load) so a Coolify container restart with a changed env
 * var takes effect within one process lifecycle — no rebuild, no redeploy.
 *
 * Non-`NEXT_PUBLIC_` vars are stripped from the client bundle, so on the
 * browser these resolve to their defaults; every authoritative gate runs
 * server-side and the client only uses them for optimistic UX.
 */

/**
 * Mage Revolution Phase 7 — gate for the medium-risk "generate" Mage actions
 * (weak-topic / exam-sim / manual practice sessions). Now that their executor
 * (`POST /api/mage/practice-sessions`) exists, the cards are offered by DEFAULT;
 * this is a kill-switch — set `MAGE_GENERATION_ACTIONS=0` and restart the
 * container to pull the generation cards (and reject the endpoint) within a
 * minute if their cost needs reining in. Consumed by the Mage message route
 * (whether to offer the cards) and the practice-sessions route (whether to run).
 */
export function mageGenerationActionsEnabled(): boolean {
  return process.env.MAGE_GENERATION_ACTIONS !== '0';
}

/**
 * Weakness Training Phase 1A — gate for closed-enum concept tagging in the
 * Stage A/B path-generation tool schemas (`ai-tools.ts`). Off by default
 * (opt-in, unlike the kill-switches above): with the flag unset, the tool
 * schemas are byte-identical to pre-Phase-1A, so default path generation
 * (and the GLM implicit prefix cache over the `PATH_TOOLS_STABLE` tools) is
 * unaffected. Set `WEAKNESS_TRAINING_CONCEPTS=1` to have Stage A emit
 * `conceptCandidates` per slot and Stage B emit `conceptKeys` per item.
 */
export function weaknessConceptsEnabled(): boolean {
  return process.env.WEAKNESS_TRAINING_CONCEPTS === '1';
}

/**
 * Weakness Training Phase 1B — gate for the user-facing remediation surfaces:
 * the `/profile/weak-spots` page and `POST /api/weakness/sessions`. Off by
 * default (opt-in), independent of `WEAKNESS_TRAINING_CONCEPTS` — the concept
 * layer can be on (writing ConceptMastery) while these surfaces stay hidden
 * until the remediation-session flow is ready. Set `WEAKNESS_TRAINING_UI=1`
 * to expose them.
 */
export function weaknessTrainingUiEnabled(): boolean {
  return process.env.WEAKNESS_TRAINING_UI === '1';
}

/**
 * Weakness Training Phase 4.1b — gate for tier-2 embedding dedup (the
 * `concept.dedup` / `concept.dedup.backfill` jobs and their Gemini embedding
 * calls). Off by default (opt-in); independent of the other weakness flags so
 * all embedding spend can be disabled instantly without touching diagnosis or
 * training. Tier-1 lexical dedup and the merge-aware loader are NOT gated —
 * they are free and behave as no-ops until merges exist.
 */
export function weaknessConceptDedupEnabled(): boolean {
  return process.env.WEAKNESS_CONCEPT_DEDUP === '1';
}

/**
 * Phase 4.3c — gate for the flashcard review-queue surface (`/practice/review`,
 * `GET /api/flashcards/review-queue`, the dashboard due-cards tile). Off by
 * default (opt-in). The deterministic core (sm2Lite, sourceWeight plumbing,
 * grade persistence) ships unflagged — it is zero-behavior-change until the
 * grading UI renders.
 */
export function flashcardReviewQueueEnabled(): boolean {
  return process.env.FLASHCARD_REVIEW_QUEUE === '1';
}

/**
 * Weakness Training Phase 4.4a — gate for the nudge sweep job and digest
 * emails. Off by default (opt-in): with the flag unset the sweep is a no-op
 * and no nudge emails are ever sent, independent of the notification
 * preference (the pref is the per-user opt-out; this is the global switch).
 */
export function weaknessNudgeSweepEnabled(): boolean {
  return process.env.WEAKNESS_NUDGE_SWEEP === '1';
}

/**
 * Mage web search (P5) — kill-switch for the OpenRouter web plugin on Mage
 * answers. Web search is LIVE by default; set `WEB_SEARCH_DISABLED=1` and
 * restart the container to disable all web-plugin attachment (grants + quota
 * still work, they just never fetch) within a process lifecycle. Consumed by
 * the chat stream when deciding whether to attach the web plugin.
 */
export function webSearchDisabled(): boolean {
  return process.env.WEB_SEARCH_DISABLED === '1';
}
