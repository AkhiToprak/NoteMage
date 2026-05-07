-- AlterTable
ALTER TABLE "users"
  ADD COLUMN "dailyStudyMinutesGoal" INTEGER,
  ADD COLUMN "weeklyStudyPlansGoal" INTEGER,
  ADD COLUMN "weeklyNotesGoal" INTEGER,
  ADD COLUMN "weeklyChatsGoal" INTEGER;

-- Existing users default to 5 minutes/day; new users start with no goal.
UPDATE "users" SET "dailyStudyMinutesGoal" = 5;

-- DropTable
DROP TABLE "study_goals";
