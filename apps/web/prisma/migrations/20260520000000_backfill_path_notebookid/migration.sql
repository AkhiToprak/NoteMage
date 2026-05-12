-- Phase 10 follow-up. Path generation persisted FlashcardSet / QuizSet
-- rows with notebookId=null whenever StudyPlan.notebookId was null,
-- which broke CheckpointDrawer (FlashcardViewer / QuizViewer hard-code
-- the notebookId into every fetch URL). Backfill in three steps:
--   1. Fill any StudyPlan that is missing a notebookId.
--   2. Propagate to its path-generated FlashcardSet rows.
--   3. Propagate to its path-generated QuizSet rows.

UPDATE "StudyPlan" sp
SET "notebookId" = COALESCE(
  sp."contextNotebookIds"[1],
  (SELECT n."id" FROM "Notebook" n WHERE n."userId" = sp."userId" ORDER BY n."createdAt" ASC LIMIT 1)
)
WHERE sp."notebookId" IS NULL;

UPDATE "FlashcardSet" fs
SET "notebookId" = sp."notebookId"
FROM "CheckpointActivity" ca
JOIN "CheckpointSlot" cs ON cs."id" = ca."slotId"
JOIN "StudyPhase" ph    ON ph."id" = cs."phaseId"
JOIN "StudyPlan" sp     ON sp."id" = ph."planId"
WHERE ca."flashcardSetId" = fs."id"
  AND fs."notebookId" IS NULL
  AND sp."notebookId" IS NOT NULL;

UPDATE "QuizSet" qs
SET "notebookId" = sp."notebookId"
FROM "CheckpointActivity" ca
JOIN "CheckpointSlot" cs ON cs."id" = ca."slotId"
JOIN "StudyPhase" ph    ON ph."id" = cs."phaseId"
JOIN "StudyPlan" sp     ON sp."id" = ph."planId"
WHERE ca."quizSetId" = qs."id"
  AND qs."notebookId" IS NULL
  AND sp."notebookId" IS NOT NULL;
