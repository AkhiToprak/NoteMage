-- Exam Mode (Phase 0) foundations — additive + nullable only.
-- Extends `exams` with a target grade (0–100 neutral) and an exam-day format,
-- and adds the study-plan + result tables. Named exam_study_plan(_item)s to
-- avoid the existing learning-path `study_plans` table.

-- AlterTable
ALTER TABLE "exams" ADD COLUMN "targetGradeNeutral" DOUBLE PRECISION;
ALTER TABLE "exams" ADD COLUMN "format" TEXT;

-- CreateTable
CREATE TABLE "exam_study_plans" (
    "id" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "horizonDays" INTEGER NOT NULL,
    "dailyMinutesTarget" INTEGER NOT NULL,
    "rationale" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exam_study_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_study_plan_items" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "scheduledDate" DATE NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "estMinutes" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'not_started',
    "refType" TEXT,
    "refId" TEXT,
    "weakPoint" BOOLEAN NOT NULL DEFAULT false,
    "urgency" INTEGER,
    "readinessDelta" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_study_plan_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_results" (
    "id" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "gradeNeutral" DOUBLE PRECISION NOT NULL,
    "outcome" TEXT NOT NULL DEFAULT 'pending',
    "difficultyFelt" TEXT,
    "notes" TEXT,
    "reflection" JSONB,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exam_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "exam_study_plans_examId_status_idx" ON "exam_study_plans"("examId", "status");

-- CreateIndex
CREATE INDEX "exam_study_plan_items_planId_scheduledDate_sortOrder_idx" ON "exam_study_plan_items"("planId", "scheduledDate", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "exam_results_examId_key" ON "exam_results"("examId");

-- AddForeignKey
ALTER TABLE "exam_study_plans" ADD CONSTRAINT "exam_study_plans_examId_fkey" FOREIGN KEY ("examId") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_study_plan_items" ADD CONSTRAINT "exam_study_plan_items_planId_fkey" FOREIGN KEY ("planId") REFERENCES "exam_study_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_results" ADD CONSTRAINT "exam_results_examId_fkey" FOREIGN KEY ("examId") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
