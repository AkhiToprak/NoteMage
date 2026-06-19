/**
 * Runtime feature flags read from the server environment.
 *
 * These are read at call time (not memoised at module load) so a Coolify
 * container restart with a changed env var takes effect within one
 * process lifecycle — no rebuild, no redeploy. That property is
 * load-bearing for the Phase 12 free-tier switchover rollback plan
 * (plans/path-publishing-community-library.md §5.2 / AC-Switch-5): flip
 * FREE_TIER_AI_PATHS_DISABLED back to `false`, restart the container, and
 * FREE users regain AI path generation within a minute.
 *
 * Non-`NEXT_PUBLIC_` vars are stripped from the client bundle, so on the
 * browser this resolves to its default (blocked — AI paths are Pro). Every
 * authoritative gate that depends on it runs server-side; the client only
 * ever uses it for optimistic UX and always defers to the server's response.
 */

/**
 * Phase 12 (path-publishing) — when true, the FREE tier's `ai_study_plan`
 * allowance drops to 0 and FREE users are routed to the community library
 * instead of the AI path generator. Consumed by `tiers.ts` (the limit
 * getter), `POST /api/learn/paths` (the server gate), and
 * `GET /api/learn/paths/access` (the client capability probe).
 *
 * Blocked is the DEFAULT: AI path generation is a Pro feature, so this
 * returns true unless the env var is explicitly "false". The flag is now a
 * re-enable (opt-OUT) lever — set FREE_TIER_AI_PATHS_DISABLED=false and
 * restart the container to hand FREE users AI paths back within a minute
 * (the AC-Switch-5 rollback still holds, just inverted).
 */
export function freeTierAiPathsDisabled(): boolean {
  return process.env.FREE_TIER_AI_PATHS_DISABLED !== 'false';
}

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
