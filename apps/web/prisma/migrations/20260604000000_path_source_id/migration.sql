-- AlterTable
ALTER TABLE "flashcard_sets" ADD COLUMN     "sourcePathId" TEXT;

-- AlterTable
ALTER TABLE "quiz_sets" ADD COLUMN     "sourcePathId" TEXT;

-- CreateIndex
CREATE INDEX "flashcard_sets_sourcePathId_idx" ON "flashcard_sets"("sourcePathId");

-- CreateIndex
CREATE INDEX "quiz_sets_sourcePathId_idx" ON "quiz_sets"("sourcePathId");

-- AddForeignKey
ALTER TABLE "flashcard_sets" ADD CONSTRAINT "flashcard_sets_sourcePathId_fkey" FOREIGN KEY ("sourcePathId") REFERENCES "study_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_sets" ADD CONSTRAINT "quiz_sets_sourcePathId_fkey" FOREIGN KEY ("sourcePathId") REFERENCES "study_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill — existing path-generated sets were created before sourcePathId
-- existed. Walk back through checkpoint_activities → checkpoint_slots →
-- study_phases → study_plans to find the owning path so the notebook list
-- filters apply retroactively, not just to paths generated from now on.
UPDATE "flashcard_sets" fs
SET "sourcePathId" = sp."id"
FROM "checkpoint_activities" ca
JOIN "checkpoint_slots" cs ON ca."slotId" = cs."id"
JOIN "study_phases" sph ON cs."phaseId" = sph."id"
JOIN "study_plans" sp ON sph."planId" = sp."id"
WHERE fs."id" = ca."flashcardSetId"
  AND fs."sourcePathId" IS NULL;

UPDATE "quiz_sets" qs
SET "sourcePathId" = sp."id"
FROM "checkpoint_activities" ca
JOIN "checkpoint_slots" cs ON ca."slotId" = cs."id"
JOIN "study_phases" sph ON cs."phaseId" = sph."id"
JOIN "study_plans" sp ON sph."planId" = sp."id"
WHERE qs."id" = ca."quizSetId"
  AND qs."sourcePathId" IS NULL;
