-- Phase 10.8 — Subject-aware path generation.
-- Adds classifier-driven subject buckets on StudyPlan and two subject-native
-- question kinds (code_output for coding, timeline for history/humanities).

-- 1. Extend the QuestionKind enum with the two new kinds. Postgres ≥ 12
--    allows this inside the migration transaction Prisma wraps around the
--    file.
ALTER TYPE "QuestionKind" ADD VALUE IF NOT EXISTS 'code_output';
ALTER TYPE "QuestionKind" ADD VALUE IF NOT EXISTS 'timeline';

-- 2. Persist classifier output on the plan. Empty arrays for existing rows;
--    the orchestrator treats empty as the legacy `general` bucket so old
--    plans keep generating without backfill.
ALTER TABLE "study_plans"
  ADD COLUMN "subjects" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "subjectWeights" DOUBLE PRECISION[] DEFAULT ARRAY[]::DOUBLE PRECISION[];
