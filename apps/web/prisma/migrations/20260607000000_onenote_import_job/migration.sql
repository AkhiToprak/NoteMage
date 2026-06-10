-- AlterTable
-- Phase 1 of the OneNote-import plan: let one import_jobs row represent either
-- a PDF or a OneNote import. Purely additive + permissive:
--   * sourceFormat discriminates the two ('pdf' | 'onenote'); existing rows
--     backfill to 'pdf', preserving the current PDF path verbatim.
--   * oneNoteSectionIds / resultSummary are OneNote-only inputs/outputs.
--   * sectionId / pdfPath / pageImagePaths were PDF-required; OneNote creates
--     many sections and has no local PDF, so they drop NOT NULL.
--   * engine gains a '' default so OneNote can omit it (it sets "onenote-html").
-- Reversible: drop the new columns + restore NOT NULL to roll back.
ALTER TABLE "import_jobs" ADD COLUMN     "oneNoteSectionIds" JSONB,
ADD COLUMN     "resultSummary" JSONB,
ADD COLUMN     "sourceFormat" TEXT NOT NULL DEFAULT 'pdf',
ALTER COLUMN "sectionId" DROP NOT NULL,
ALTER COLUMN "engine" SET DEFAULT '',
ALTER COLUMN "pdfPath" DROP NOT NULL,
ALTER COLUMN "pageImagePaths" DROP NOT NULL;
