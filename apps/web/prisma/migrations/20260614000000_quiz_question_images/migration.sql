-- Figure-reuse feature (P4): a quiz question MAY carry ONE exhibit image,
-- snapshotted (copied, not referenced) from a source PageImage at generation
-- time so the question survives source-page deletion — mirrors theory_images.
-- `questionId` is UNIQUE: at most one exhibit per question. `caption` is the
-- model's slot-local caption (nullable). `sourcePageImageId` is provenance only
-- (nullable so source deletion can't strand us).
-- CreateTable
CREATE TABLE "quiz_question_images" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "sourcePageImageId" TEXT,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "caption" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quiz_question_images_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "quiz_question_images_questionId_key" ON "quiz_question_images"("questionId");

-- AddForeignKey
ALTER TABLE "quiz_question_images" ADD CONSTRAINT "quiz_question_images_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "quiz_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
