-- Path-publishing Layer 4 (P13) — post-publish reports + trust scoring.
-- Additive only: one new column on users, one new table. No drops.

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "publishTrustScore" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "reports" (
    "id" TEXT NOT NULL,
    "sharedPathId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "detail" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reports_sharedPathId_status_idx" ON "reports"("sharedPathId", "status");

-- CreateIndex
CREATE INDEX "reports_status_createdAt_idx" ON "reports"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "reports_sharedPathId_reporterId_key" ON "reports"("sharedPathId", "reporterId");

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_sharedPathId_fkey" FOREIGN KEY ("sharedPathId") REFERENCES "shared_paths"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
