-- Phase 10.1 — guided checkpoint bundles.
-- Hard cutover: no users in production, so we wipe every study plan and drop
-- the legacy material/checkpoint tables before recreating the new shape.

-- 1. Wipe every plan. Cascades to study_phases, study_materials, and
--    checkpoint_attempts via existing FKs.
DELETE FROM "study_plans";

-- 2. Drop legacy tables.
DROP TABLE "study_materials";
DROP TABLE "checkpoint_attempts";

-- 3. Add generation lifecycle columns to study_plans.
ALTER TABLE "study_plans"
  ADD COLUMN "generationStatus" TEXT NOT NULL DEFAULT 'ready',
  ADD COLUMN "generationProgress" JSONB,
  ADD COLUMN "generationError" TEXT;

-- 4. New tables. Created in dependency order so FKs resolve cleanly.

CREATE TABLE "theory_content" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "theory_content_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "checkpoint_slots" (
    "id" TEXT NOT NULL,
    "phaseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'learning',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "prerequisiteSlotIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "starsEarned" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "checkpoint_slots_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "checkpoint_slots_phaseId_idx" ON "checkpoint_slots"("phaseId");

ALTER TABLE "checkpoint_slots"
    ADD CONSTRAINT "checkpoint_slots_phaseId_fkey"
    FOREIGN KEY ("phaseId") REFERENCES "study_phases"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "checkpoint_activities" (
    "id" TEXT NOT NULL,
    "slotId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "theoryId" TEXT,
    "flashcardSetId" TEXT,
    "quizSetId" TEXT,

    CONSTRAINT "checkpoint_activities_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "checkpoint_activities_theoryId_key" ON "checkpoint_activities"("theoryId");
CREATE UNIQUE INDEX "checkpoint_activities_flashcardSetId_key" ON "checkpoint_activities"("flashcardSetId");
CREATE UNIQUE INDEX "checkpoint_activities_quizSetId_key" ON "checkpoint_activities"("quizSetId");
CREATE INDEX "checkpoint_activities_slotId_idx" ON "checkpoint_activities"("slotId");

ALTER TABLE "checkpoint_activities"
    ADD CONSTRAINT "checkpoint_activities_slotId_fkey"
    FOREIGN KEY ("slotId") REFERENCES "checkpoint_slots"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "checkpoint_activities"
    ADD CONSTRAINT "checkpoint_activities_theoryId_fkey"
    FOREIGN KEY ("theoryId") REFERENCES "theory_content"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "checkpoint_activities"
    ADD CONSTRAINT "checkpoint_activities_flashcardSetId_fkey"
    FOREIGN KEY ("flashcardSetId") REFERENCES "flashcard_sets"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "checkpoint_activities"
    ADD CONSTRAINT "checkpoint_activities_quizSetId_fkey"
    FOREIGN KEY ("quizSetId") REFERENCES "quiz_sets"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "assessment_attempts" (
    "id" TEXT NOT NULL,
    "slotId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "percentage" DOUBLE PRECISION NOT NULL,
    "starsEarned" INTEGER NOT NULL,
    "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessment_attempts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "assessment_attempts_userId_idx" ON "assessment_attempts"("userId");
CREATE INDEX "assessment_attempts_slotId_idx" ON "assessment_attempts"("slotId");

ALTER TABLE "assessment_attempts"
    ADD CONSTRAINT "assessment_attempts_slotId_fkey"
    FOREIGN KEY ("slotId") REFERENCES "checkpoint_slots"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "assessment_attempts"
    ADD CONSTRAINT "assessment_attempts_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
