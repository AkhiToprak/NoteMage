-- Add per-user grading system preference (id from src/lib/grading-systems.ts).
-- Nullable: null = the user has not chosen one yet (set in onboarding, editable in settings).
ALTER TABLE "users" ADD COLUMN "gradingSystem" VARCHAR(20);
