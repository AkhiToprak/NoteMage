-- CreateEnum
CREATE TYPE "GateStrategy" AS ENUM ('open', 'sequential', 'checkpoint');

-- AlterTable: StudyPhase gains gateStrategy (defaults preserve legacy plans).
ALTER TABLE "study_phases" ADD COLUMN "gateStrategy" "GateStrategy" NOT NULL DEFAULT 'open';

-- AlterTable: StudyMaterial gains prerequisiteMaterialIds (Postgres text array).
ALTER TABLE "study_materials" ADD COLUMN "prerequisiteMaterialIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- CreateTable: CheckpointAttempt logs every checkpoint quiz submission.
CREATE TABLE "checkpoint_attempts" (
    "id" TEXT NOT NULL,
    "phaseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "percentage" DOUBLE PRECISION NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checkpoint_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "checkpoint_attempts_userId_idx" ON "checkpoint_attempts"("userId");

-- CreateIndex
CREATE INDEX "checkpoint_attempts_phaseId_idx" ON "checkpoint_attempts"("phaseId");

-- AddForeignKey
ALTER TABLE "checkpoint_attempts" ADD CONSTRAINT "checkpoint_attempts_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "study_phases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkpoint_attempts" ADD CONSTRAINT "checkpoint_attempts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
