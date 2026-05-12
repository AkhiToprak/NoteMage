-- Phase 10 follow-up. Path generation persisted flashcard_sets / quiz_sets
-- rows with notebookId=null whenever study_plans.notebookId was null,
-- which broke CheckpointDrawer (FlashcardViewer / QuizViewer hard-code
-- the notebookId into every fetch URL). Backfill in three steps:
--   1. Fill any study_plans row that is missing a notebookId.
--   2. Propagate to its path-generated flashcard_sets rows.
--   3. Propagate to its path-generated quiz_sets rows.

UPDATE "study_plans" sp
SET "notebookId" = COALESCE(
  sp."contextNotebookIds"[1],
  (SELECT n."id" FROM "notebooks" n WHERE n."userId" = sp."userId" ORDER BY n."createdAt" ASC LIMIT 1)
)
WHERE sp."notebookId" IS NULL;

UPDATE "flashcard_sets" fs
SET "notebookId" = sp."notebookId"
FROM "checkpoint_activities" ca
JOIN "checkpoint_slots" cs ON cs."id" = ca."slotId"
JOIN "study_phases" ph     ON ph."id" = cs."phaseId"
JOIN "study_plans" sp      ON sp."id" = ph."planId"
WHERE ca."flashcardSetId" = fs."id"
  AND fs."notebookId" IS NULL
  AND sp."notebookId" IS NOT NULL;

UPDATE "quiz_sets" qs
SET "notebookId" = sp."notebookId"
FROM "checkpoint_activities" ca
JOIN "checkpoint_slots" cs ON cs."id" = ca."slotId"
JOIN "study_phases" ph     ON ph."id" = cs."phaseId"
JOIN "study_plans" sp      ON sp."id" = ph."planId"
WHERE ca."quizSetId" = qs."id"
  AND qs."notebookId" IS NULL
  AND sp."notebookId" IS NOT NULL;
