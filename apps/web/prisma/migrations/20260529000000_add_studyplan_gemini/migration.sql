-- Per-path Gemini override (test toggle). When true, every stage
-- (structure / theory / flashcards / quiz) routes through Gemini
-- regardless of PATH_PROVIDER env vars OR the ultra flag. Default
-- false preserves the prior Anthropic-only routing on existing rows.
ALTER TABLE "study_plans" ADD COLUMN "gemini" BOOLEAN NOT NULL DEFAULT false;
