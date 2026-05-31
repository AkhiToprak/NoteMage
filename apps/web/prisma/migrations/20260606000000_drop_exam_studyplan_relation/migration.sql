-- Removes the legacy Exam <-> StudyPlan link. The exam-generated study-plan
-- feature was superseded by Learn Paths; no code reads or writes examId.
-- Any existing exam-linked plans survive as normal plans (the link is dropped).

-- DropForeignKey
ALTER TABLE "study_plans" DROP CONSTRAINT "study_plans_examId_fkey";

-- DropIndex
DROP INDEX "study_plans_examId_key";

-- AlterTable
ALTER TABLE "study_plans" DROP COLUMN "examId";
