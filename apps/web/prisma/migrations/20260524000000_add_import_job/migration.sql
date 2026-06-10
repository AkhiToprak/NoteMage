-- CreateTable
CREATE TABLE "import_jobs" (
    "id" TEXT NOT NULL,
    "notebookId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "engine" TEXT NOT NULL,
    "pageCap" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "progress" JSONB,
    "error" TEXT,
    "pdfPath" TEXT NOT NULL,
    "pageImagePaths" JSONB NOT NULL,
    "resultPageId" TEXT,
    "truncated" BOOLEAN NOT NULL DEFAULT false,
    "fallbackPages" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "import_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "import_jobs_notebookId_idx" ON "import_jobs"("notebookId");

-- CreateIndex
CREATE INDEX "import_jobs_userId_status_idx" ON "import_jobs"("userId", "status");

-- AddForeignKey
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_notebookId_fkey" FOREIGN KEY ("notebookId") REFERENCES "notebooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

