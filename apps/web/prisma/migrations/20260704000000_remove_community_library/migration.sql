-- Remove the community library (path publishing + moderation).
--
-- Drops the published-path table and its moderation / translation / rating /
-- report / ticket satellites, plus the two columns that only the community
-- feature used (StudyPlan.clonedFromSharedPathId, User.publishTrustScore).
--
-- DESTRUCTIVE: this permanently deletes every published-path row and all
-- moderation history. Generated but intentionally NOT auto-applied — apply on
-- Coolify when ready. Statements use IF EXISTS so a re-run is a no-op.

-- StudyPlan.clonedFromSharedPathId — drop the FK + index before the column.
ALTER TABLE "study_plans" DROP CONSTRAINT IF EXISTS "study_plans_clonedFromSharedPathId_fkey";
DROP INDEX IF EXISTS "study_plans_clonedFromSharedPathId_idx";
ALTER TABLE "study_plans" DROP COLUMN IF EXISTS "clonedFromSharedPathId";

-- User.publishTrustScore — the new-author moderation trust score.
ALTER TABLE "users" DROP COLUMN IF EXISTS "publishTrustScore";

-- Community-library tables. Dropped child-first; each DROP TABLE also removes
-- that table's own foreign-key constraints, so the satellites that reference
-- shared_paths are gone before shared_paths itself is dropped.
DROP TABLE IF EXISTS "tickets";
DROP TABLE IF EXISTS "reports";
DROP TABLE IF EXISTS "path_ratings";
DROP TABLE IF EXISTS "moderation_audits";
DROP TABLE IF EXISTS "path_translations";
DROP TABLE IF EXISTS "shared_paths";
