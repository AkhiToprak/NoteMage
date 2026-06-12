-- AlterTable
-- Native video import (Lane 2, plan §P2): additive, backfill-safe columns on
-- import_jobs for video jobs. All nullable (mediaResolution defaulted) so
-- existing PDF/OneNote rows are unaffected and the discriminator extends to
-- sourceFormat = "video".
ALTER TABLE "import_jobs" ADD COLUMN     "mediaResolution" TEXT DEFAULT 'low',
ADD COLUMN     "videoDurationSec" INTEGER,
ADD COLUMN     "videoPath" TEXT,
ADD COLUMN     "videoUrl" TEXT;
