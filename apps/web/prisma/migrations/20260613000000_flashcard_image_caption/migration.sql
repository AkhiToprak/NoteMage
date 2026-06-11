-- Figure-reuse feature (P3): path-generated flashcard figures carry a
-- slot-local AI caption. Nullable so manually-uploaded flashcard images
-- (which have no AI caption) are unaffected.
-- AlterTable
ALTER TABLE "flashcard_images" ADD COLUMN "caption" TEXT;
