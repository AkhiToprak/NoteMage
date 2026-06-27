-- CreateTable
CREATE TABLE "pending_onboarding_paths" (
    "id" TEXT NOT NULL,
    "anonToken" TEXT NOT NULL,
    "sourceKind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "goal" TEXT,
    "intensity" TEXT,
    "cappedCorpus" TEXT,
    "fullText" TEXT,
    "structureJson" JSONB NOT NULL,
    "lessonJson" JSONB NOT NULL,
    "previewQuestionsJson" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ready',
    "claimedByUserId" TEXT,
    "claimedPlanId" TEXT,
    "ipHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pending_onboarding_paths_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pending_onboarding_paths_anonToken_key" ON "pending_onboarding_paths"("anonToken");

-- CreateIndex
CREATE INDEX "pending_onboarding_paths_expiresAt_idx" ON "pending_onboarding_paths"("expiresAt");
