-- Path-diagrams revival (Phase 5): the `diagram_cloze` question kind — a
-- deterministic "what's missing in this diagram?" question built in code from a
-- quiz set's structured `diagrams` (zero AI tokens, never LLM-emitted). Only a
-- new enum value; the existing `payload` JSONB column carries its shape.
-- Postgres >= 12 (and PG15/Supabase) runs ALTER TYPE ... ADD VALUE inside a
-- transaction; IF NOT EXISTS keeps re-applies idempotent.

-- AlterEnum
ALTER TYPE "QuestionKind" ADD VALUE IF NOT EXISTS 'diagram_cloze';
