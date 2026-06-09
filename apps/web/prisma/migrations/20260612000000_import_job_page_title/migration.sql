-- AlterTable
-- Import organize step: the user names the imported page in the import
-- dialog before the job is queued. Nullable; null keeps the existing
-- derive-from-fileName behavior, so old rows and OneNote jobs are unaffected.
ALTER TABLE "import_jobs" ADD COLUMN "pageTitle" TEXT;
