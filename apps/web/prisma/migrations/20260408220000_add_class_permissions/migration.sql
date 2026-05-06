-- Add permission fields to study_groups for class support
ALTER TABLE "study_groups" ADD COLUMN IF NOT EXISTS "allowMemberChat" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "study_groups" ADD COLUMN IF NOT EXISTS "allowMemberSharing" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "study_groups" ADD COLUMN IF NOT EXISTS "allowMemberInvites" BOOLEAN NOT NULL DEFAULT true;
