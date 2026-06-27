-- Source provenance (Phase D) — denormalized per-question grounding so the quiz
-- player's "Show source" reader drawer can highlight the exact passage a
-- question was written from. Denormalized (not a FK into documents/source_regions)
-- on purpose: community-cloned and raw-text paths have no live source row, and the
-- quote is what we highlight regardless.
--
-- All nullable + no backfill: legacy rows, the code-generated diagram_cloze, and
-- questions the model couldn't ground stay null and the player falls back to the
-- path-level source. Purely additive — safe to apply on a live table.
ALTER TABLE "quiz_questions" ADD COLUMN "sourceLabel" TEXT;
ALTER TABLE "quiz_questions" ADD COLUMN "sourcePage" INTEGER;
ALTER TABLE "quiz_questions" ADD COLUMN "sourceQuote" TEXT;
