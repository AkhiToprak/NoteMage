-- AlterTable
ALTER TABLE "page_images" ADD COLUMN     "aiCaption" TEXT,
ADD COLUMN     "captionedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "shared_paths" ADD COLUMN     "includeImages" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "theory_images" (
    "id" TEXT NOT NULL,
    "theoryId" TEXT NOT NULL,
    "sourcePageImageId" TEXT,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "caption" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "theory_images_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "theory_images_theoryId_idx" ON "theory_images"("theoryId");

-- AddForeignKey
ALTER TABLE "theory_images" ADD CONSTRAINT "theory_images_theoryId_fkey" FOREIGN KEY ("theoryId") REFERENCES "theory_content"("id") ON DELETE CASCADE ON UPDATE CASCADE;
