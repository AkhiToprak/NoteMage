-- Source-highlighting feature — unify grounding anchors across theory,
-- flashcards, and quiz questions, and give every anchor a stable link back to
-- the ORIGIN material so the source viewer can open the PDF page / seek the
-- video / scroll the document, not just re-print the quote.
--
-- Identity (sourceMaterialId/Kind) is resolved server-side from the in-memory
-- corpus at generation time — the model never echoes an opaque id. sourcePage is
-- the 1-based PDF page; sourceTimestampSec is the video seek target in seconds.
--
-- All additive + nullable: legacy rows stay null and the viewer falls back to
-- the quote-only drawer / Mage. Safe to apply on a live table. Generated but NOT
-- auto-applied — apply on Coolify when ready. IF (NOT) EXISTS makes re-runs no-ops.

-- quiz_questions already has sourceLabel/sourcePage/sourceQuote (Phase D); add
-- only the identity + media-seek columns.
ALTER TABLE "quiz_questions" ADD COLUMN IF NOT EXISTS "sourceMaterialId" TEXT;
ALTER TABLE "quiz_questions" ADD COLUMN IF NOT EXISTS "sourceMaterialKind" TEXT;
ALTER TABLE "quiz_questions" ADD COLUMN IF NOT EXISTS "sourceTimestampSec" INTEGER;

-- theory_content — add the full anchor set (one primary anchor per lesson).
ALTER TABLE "theory_content" ADD COLUMN IF NOT EXISTS "sourceLabel" TEXT;
ALTER TABLE "theory_content" ADD COLUMN IF NOT EXISTS "sourcePage" INTEGER;
ALTER TABLE "theory_content" ADD COLUMN IF NOT EXISTS "sourceQuote" TEXT;
ALTER TABLE "theory_content" ADD COLUMN IF NOT EXISTS "sourceMaterialId" TEXT;
ALTER TABLE "theory_content" ADD COLUMN IF NOT EXISTS "sourceMaterialKind" TEXT;
ALTER TABLE "theory_content" ADD COLUMN IF NOT EXISTS "sourceTimestampSec" INTEGER;

-- flashcards — add the full anchor set (one anchor per card).
ALTER TABLE "flashcards" ADD COLUMN IF NOT EXISTS "sourceLabel" TEXT;
ALTER TABLE "flashcards" ADD COLUMN IF NOT EXISTS "sourcePage" INTEGER;
ALTER TABLE "flashcards" ADD COLUMN IF NOT EXISTS "sourceQuote" TEXT;
ALTER TABLE "flashcards" ADD COLUMN IF NOT EXISTS "sourceMaterialId" TEXT;
ALTER TABLE "flashcards" ADD COLUMN IF NOT EXISTS "sourceMaterialKind" TEXT;
ALTER TABLE "flashcards" ADD COLUMN IF NOT EXISTS "sourceTimestampSec" INTEGER;

-- pages — durable video origin (the YouTube URL lives on the ephemeral
-- import_jobs ledger; denormalize so the viewer needs no reverse join).
ALTER TABLE "pages" ADD COLUMN IF NOT EXISTS "sourceVideoUrl" TEXT;
ALTER TABLE "pages" ADD COLUMN IF NOT EXISTS "sourceMediaType" TEXT;

-- Backfill the new page columns from existing video import jobs. YouTube imports
-- carry a durable videoUrl (seekable embed); uploaded videos have only a temp
-- videoPath (viewer degrades to transcript), so we mark the media type but leave
-- the URL null.
UPDATE "pages" p
SET "sourceVideoUrl" = j."videoUrl", "sourceMediaType" = 'youtube'
FROM "import_jobs" j
WHERE p.id = j."resultPageId"
  AND j."sourceFormat" = 'video'
  AND j."videoUrl" IS NOT NULL;

UPDATE "pages" p
SET "sourceMediaType" = 'upload'
FROM "import_jobs" j
WHERE p.id = j."resultPageId"
  AND j."sourceFormat" = 'video'
  AND j."videoUrl" IS NULL
  AND p."sourceMediaType" IS NULL;
