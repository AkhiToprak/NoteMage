-- AlterTable
ALTER TABLE "shared_notebooks" ADD COLUMN "title" TEXT;
ALTER TABLE "shared_notebooks" ADD COLUMN "description" TEXT;

-- CreateTable
CREATE TABLE "shared_notebook_images" (
    "id" TEXT NOT NULL,
    "sharedNotebookId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shared_notebook_images_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shared_notebook_images_sharedNotebookId_idx" ON "shared_notebook_images"("sharedNotebookId");

-- AddForeignKey
ALTER TABLE "shared_notebook_images" ADD CONSTRAINT "shared_notebook_images_sharedNotebookId_fkey" FOREIGN KEY ("sharedNotebookId") REFERENCES "shared_notebooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
