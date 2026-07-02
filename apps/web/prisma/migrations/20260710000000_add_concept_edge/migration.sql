-- CreateTable
CREATE TABLE "concept_edges" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "fromConceptId" TEXT NOT NULL,
    "toConceptId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'prerequisite',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "concept_edges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "concept_edges_fromConceptId_toConceptId_key" ON "concept_edges"("fromConceptId", "toConceptId");

-- CreateIndex
CREATE INDEX "concept_edges_toConceptId_idx" ON "concept_edges"("toConceptId");

-- CreateIndex
CREATE INDEX "concept_edges_planId_idx" ON "concept_edges"("planId");

-- AddForeignKey
ALTER TABLE "concept_edges" ADD CONSTRAINT "concept_edges_planId_fkey" FOREIGN KEY ("planId") REFERENCES "study_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concept_edges" ADD CONSTRAINT "concept_edges_fromConceptId_fkey" FOREIGN KEY ("fromConceptId") REFERENCES "concepts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concept_edges" ADD CONSTRAINT "concept_edges_toConceptId_fkey" FOREIGN KEY ("toConceptId") REFERENCES "concepts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
