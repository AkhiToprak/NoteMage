-- AlterTable
ALTER TABLE "concepts" ADD COLUMN     "canonicalId" TEXT,
ADD COLUMN     "mergedLabelSnapshot" TEXT,
ADD COLUMN     "mergedAt" TIMESTAMP(3),
ADD COLUMN     "embedding" DOUBLE PRECISION[],
ADD COLUMN     "embeddedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "concept_attempt_events" ADD COLUMN     "origin" TEXT NOT NULL DEFAULT 'general';

-- CreateIndex
CREATE INDEX "concepts_canonicalId_idx" ON "concepts"("canonicalId");

-- AddForeignKey
ALTER TABLE "concepts" ADD CONSTRAINT "concepts_canonicalId_fkey" FOREIGN KEY ("canonicalId") REFERENCES "concepts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
