-- CreateTable
CREATE TABLE "concepts" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "slotId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "concepts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "concept_tags" (
    "id" TEXT NOT NULL,
    "conceptId" TEXT NOT NULL,
    "itemType" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "concept_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "concept_attempt_events" (
    "id" TEXT NOT NULL,
    "conceptId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "itemType" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "sourceAttemptId" TEXT NOT NULL,
    "questionKind" TEXT NOT NULL,
    "quality" INTEGER NOT NULL,
    "isCorrect" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "concept_attempt_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "concept_masteries" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conceptId" TEXT NOT NULL,
    "weightedCorrect" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "weightedTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "lastCorrectAt" TIMESTAMP(3),
    "peakLcb" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'untested',
    "misconceptionLabel" TEXT,
    "misconceptionAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "concept_masteries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "concepts_planId_idx" ON "concepts"("planId");

-- CreateIndex
CREATE UNIQUE INDEX "concepts_slotId_key_key" ON "concepts"("slotId", "key");

-- CreateIndex
CREATE INDEX "concept_tags_itemType_itemId_idx" ON "concept_tags"("itemType", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "concept_tags_conceptId_itemType_itemId_key" ON "concept_tags"("conceptId", "itemType", "itemId");

-- CreateIndex
CREATE INDEX "concept_attempt_events_userId_conceptId_createdAt_idx" ON "concept_attempt_events"("userId", "conceptId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "concept_attempt_events_sourceAttemptId_conceptId_itemId_key" ON "concept_attempt_events"("sourceAttemptId", "conceptId", "itemId");

-- CreateIndex
CREATE INDEX "concept_masteries_userId_status_idx" ON "concept_masteries"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "concept_masteries_userId_conceptId_key" ON "concept_masteries"("userId", "conceptId");

-- AddForeignKey
ALTER TABLE "concepts" ADD CONSTRAINT "concepts_planId_fkey" FOREIGN KEY ("planId") REFERENCES "study_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concept_tags" ADD CONSTRAINT "concept_tags_conceptId_fkey" FOREIGN KEY ("conceptId") REFERENCES "concepts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concept_attempt_events" ADD CONSTRAINT "concept_attempt_events_conceptId_fkey" FOREIGN KEY ("conceptId") REFERENCES "concepts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concept_masteries" ADD CONSTRAINT "concept_masteries_conceptId_fkey" FOREIGN KEY ("conceptId") REFERENCES "concepts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
