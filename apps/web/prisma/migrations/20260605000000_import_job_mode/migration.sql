-- AlterTable
-- P5 of the token-cost-reduction plan: opt-in fast (text-layer) PDF import.
-- Additive; existing rows default to 'rich' which preserves the current
-- vision-engine path verbatim. Reversible: drop the column to roll back.
ALTER TABLE "import_jobs" ADD COLUMN "mode" TEXT NOT NULL DEFAULT 'rich';
