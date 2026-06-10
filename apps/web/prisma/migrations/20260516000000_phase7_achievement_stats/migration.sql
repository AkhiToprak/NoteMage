-- Phase 7 (personal learning-path rework) — denormalized achievement stats.
-- `maxQuizStreakEver` and `everHadComeback` are bumped by the quiz attempts
-- route at submission time so `gatherUserStats()` can read them with a
-- single column lookup instead of replaying every QuizAttempt.answers blob.
-- Defaults match a freshly-computed replay over zero history, so no
-- backfill is required.

-- AlterTable
ALTER TABLE "users" ADD COLUMN "maxQuizStreakEver" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN "everHadComeback" BOOLEAN NOT NULL DEFAULT false;
