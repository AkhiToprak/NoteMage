-- Additive prompt-quality metadata. Existing rows remain valid and nullable.
ALTER TABLE "quiz_sets"
  ADD COLUMN "generationPromptVersion" TEXT,
  ADD COLUMN "generationProvider" TEXT,
  ADD COLUMN "generationModel" TEXT,
  ADD COLUMN "verificationStatus" TEXT,
  ADD COLUMN "verificationModel" TEXT,
  ADD COLUMN "verificationDetails" JSONB;

ALTER TABLE "checkpoint_slots"
  ADD COLUMN "assessmentSpec" JSONB;
