-- Path generation reliability (plans/path-generation-reliability.md, Phase 2).
-- Records the activity kinds Stage B intentionally pruned for a slot because
-- the material was too thin to support them. Distinct from a generation
-- FAILURE (expected kind simply absent): path-gating treats a pruned kind as
-- satisfied, so a deliberately-tight checkpoint reads as complete, not broken.
-- Additive + defaulted, so existing rows backfill to '{}' (nothing pruned).
-- AlterTable
ALTER TABLE "checkpoint_slots" ADD COLUMN     "prunedActivityKinds" TEXT[] DEFAULT ARRAY[]::TEXT[];
