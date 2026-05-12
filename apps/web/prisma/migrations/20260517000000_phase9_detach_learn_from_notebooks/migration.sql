-- Phase 9.1 — Detach learn surfaces from notebooks.
-- Adds direct userId ownership to NotebookChat / FlashcardSet / QuizSet /
-- StudyPlan, makes their notebookId nullable (ON DELETE SET NULL), introduces
-- contextNotebookIds arrays on NotebookChat + StudyPlan, and adds a kind
-- discriminator to Notebook for the future "inbox" notebook.

-- ── Step 1: Add userId column (nullable initially so the backfill can run).
ALTER TABLE "notebook_chats" ADD COLUMN "userId" TEXT;
ALTER TABLE "flashcard_sets" ADD COLUMN "userId" TEXT;
ALTER TABLE "quiz_sets"      ADD COLUMN "userId" TEXT;
ALTER TABLE "study_plans"    ADD COLUMN "userId" TEXT;

-- ── Step 2: Backfill userId from the parent notebook. Every existing row
--           has a non-null notebookId, so this populates everything.
UPDATE "notebook_chats" SET "userId" = n."userId" FROM "notebooks" n WHERE "notebook_chats"."notebookId" = n."id";
UPDATE "flashcard_sets" SET "userId" = n."userId" FROM "notebooks" n WHERE "flashcard_sets"."notebookId" = n."id";
UPDATE "quiz_sets"      SET "userId" = n."userId" FROM "notebooks" n WHERE "quiz_sets"."notebookId"      = n."id";
UPDATE "study_plans"    SET "userId" = n."userId" FROM "notebooks" n WHERE "study_plans"."notebookId"    = n."id";

-- ── Step 3: Promote userId to NOT NULL and add FK + index.
ALTER TABLE "notebook_chats" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "flashcard_sets" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "quiz_sets"      ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "study_plans"    ALTER COLUMN "userId" SET NOT NULL;

ALTER TABLE "notebook_chats" ADD CONSTRAINT "notebook_chats_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "flashcard_sets" ADD CONSTRAINT "flashcard_sets_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quiz_sets" ADD CONSTRAINT "quiz_sets_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "study_plans" ADD CONSTRAINT "study_plans_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "notebook_chats_userId_idx" ON "notebook_chats"("userId");
CREATE INDEX "flashcard_sets_userId_idx" ON "flashcard_sets"("userId");
CREATE INDEX "quiz_sets_userId_idx"      ON "quiz_sets"("userId");
CREATE INDEX "study_plans_userId_idx"    ON "study_plans"("userId");

-- ── Step 4: Drop the old notebookId cascade FK and recreate as SET NULL +
--           nullable so cross-notebook / inbox-only rows can exist later.
ALTER TABLE "notebook_chats" DROP CONSTRAINT "notebook_chats_notebookId_fkey";
ALTER TABLE "notebook_chats" ALTER COLUMN "notebookId" DROP NOT NULL;
ALTER TABLE "notebook_chats" ADD CONSTRAINT "notebook_chats_notebookId_fkey"
  FOREIGN KEY ("notebookId") REFERENCES "notebooks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "flashcard_sets" DROP CONSTRAINT "flashcard_sets_notebookId_fkey";
ALTER TABLE "flashcard_sets" ALTER COLUMN "notebookId" DROP NOT NULL;
ALTER TABLE "flashcard_sets" ADD CONSTRAINT "flashcard_sets_notebookId_fkey"
  FOREIGN KEY ("notebookId") REFERENCES "notebooks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "quiz_sets" DROP CONSTRAINT "quiz_sets_notebookId_fkey";
ALTER TABLE "quiz_sets" ALTER COLUMN "notebookId" DROP NOT NULL;
ALTER TABLE "quiz_sets" ADD CONSTRAINT "quiz_sets_notebookId_fkey"
  FOREIGN KEY ("notebookId") REFERENCES "notebooks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "study_plans" DROP CONSTRAINT "study_plans_notebookId_fkey";
ALTER TABLE "study_plans" ALTER COLUMN "notebookId" DROP NOT NULL;
ALTER TABLE "study_plans" ADD CONSTRAINT "study_plans_notebookId_fkey"
  FOREIGN KEY ("notebookId") REFERENCES "notebooks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Step 5: contextNotebookIds arrays for multi-notebook chats / paths.
ALTER TABLE "notebook_chats" ADD COLUMN "contextNotebookIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "study_plans"    ADD COLUMN "contextNotebookIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- ── Step 6: Notebook.kind — 'standard' (user-created) | 'inbox' (system).
ALTER TABLE "notebooks" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'standard';
