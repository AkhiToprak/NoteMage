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
