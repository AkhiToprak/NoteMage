-- CreateTable
CREATE TABLE "sections" (
    "id" TEXT NOT NULL,
    "notebookId" TEXT NOT NULL,
    "parentId" TEXT,
    "title" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "color" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pages" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Untitled',
    "content" JSONB,
    "textContent" TEXT,
    "drawingData" JSONB,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "sourceDocId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "page_images" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "page_images_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sections_notebookId_idx" ON "sections"("notebookId");

-- CreateIndex
CREATE INDEX "sections_parentId_idx" ON "sections"("parentId");

-- CreateIndex
CREATE INDEX "pages_sectionId_idx" ON "pages"("sectionId");

-- CreateIndex
CREATE INDEX "page_images_pageId_idx" ON "page_images"("pageId");

-- AddForeignKey
ALTER TABLE "sections" ADD CONSTRAINT "sections_notebookId_fkey" FOREIGN KEY ("notebookId") REFERENCES "notebooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sections" ADD CONSTRAINT "sections_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pages" ADD CONSTRAINT "pages_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_images" ADD CONSTRAINT "page_images_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
