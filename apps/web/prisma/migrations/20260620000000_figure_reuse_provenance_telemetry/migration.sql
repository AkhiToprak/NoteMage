-- AlterTable
ALTER TABLE "flashcard_images" ADD COLUMN     "sourcePageImageId" TEXT;

-- AlterTable
ALTER TABLE "page_images" ADD COLUMN     "bbox" JSONB,
ADD COLUMN     "sourceType" TEXT;

-- CreateTable
CREATE TABLE "path_generation_telemetry" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "userId" TEXT,
    "sourceImageCount" INTEGER NOT NULL DEFAULT 0,
    "catalogImageCount" INTEGER NOT NULL DEFAULT 0,
    "requestedRefs" INTEGER NOT NULL DEFAULT 0,
    "acceptedRefs" INTEGER NOT NULL DEFAULT 0,
    "rejectedRefs" INTEGER NOT NULL DEFAULT 0,
    "rejections" JSONB,
    "snapshotCount" INTEGER NOT NULL DEFAULT 0,
    "theoryImageCount" INTEGER NOT NULL DEFAULT 0,
    "flashcardImageCount" INTEGER NOT NULL DEFAULT 0,
    "quizImageCount" INTEGER NOT NULL DEFAULT 0,
    "skippedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "path_generation_telemetry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "path_generation_telemetry_createdAt_idx" ON "path_generation_telemetry"("createdAt");

-- CreateIndex
CREATE INDEX "path_generation_telemetry_userId_createdAt_idx" ON "path_generation_telemetry"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "path_generation_telemetry_planId_idx" ON "path_generation_telemetry"("planId");
