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
 * browser these resolve to their default (flag off). Every authoritative
 * gate that depends on them runs server-side; the client only ever uses
 * them for optimistic UX and always defers to the server's response.
 */

/**
 * Phase 12 (path-publishing) — when true, the FREE tier's `ai_study_plan`
 * allowance drops to 0 and FREE users are routed to the community library
 * instead of the AI path generator. Consumed by `tiers.ts` (the limit
 * getter), `POST /api/learn/paths` (the server gate), and
 * `GET /api/learn/paths/access` (the client capability probe).
 */
export function freeTierAiPathsDisabled(): boolean {
  return process.env.FREE_TIER_AI_PATHS_DISABLED === 'true';
}
