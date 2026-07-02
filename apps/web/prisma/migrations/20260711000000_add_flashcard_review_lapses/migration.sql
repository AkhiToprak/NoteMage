-- AlterTable
ALTER TABLE "flashcards" ADD COLUMN     "lapses" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "flashcards_nextReviewAt_idx" ON "flashcards"("nextReviewAt");
