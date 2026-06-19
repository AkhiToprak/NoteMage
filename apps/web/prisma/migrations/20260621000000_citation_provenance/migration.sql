-- AlterTable
ALTER TABLE "pages" ADD COLUMN     "sourceDocPage" INTEGER;

-- CreateTable
CREATE TABLE "source_regions" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "pageNumber" INTEGER NOT NULL,
    "charStart" INTEGER,
    "charEnd" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "source_regions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "source_regions_documentId_pageNumber_idx" ON "source_regions"("documentId", "pageNumber");

-- AddForeignKey
ALTER TABLE "source_regions" ADD CONSTRAINT "source_regions_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
