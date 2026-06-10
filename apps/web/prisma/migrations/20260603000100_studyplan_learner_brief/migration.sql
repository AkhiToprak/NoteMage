-- Persist the learner's "Study goals" brief on the plan so Stage B (which
-- reloads the plan from the DB) can feed the learner's requested tone /
-- emphasis / focus / difficulty into the actual content prompts, not just the
-- Stage A structure call.
ALTER TABLE "study_plans" ADD COLUMN "learnerBrief" TEXT;
