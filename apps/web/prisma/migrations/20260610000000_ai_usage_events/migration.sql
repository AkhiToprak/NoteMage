-- Per-call AI token-usage + cost ledger. Written best-effort by logAiUsage()
-- across EVERY AI surface (chat, path generation, page generation, essay,
-- summarize, inline, classify, …) so the admin console can roll up token spend
-- and USD cost by feature, not just chat. userId is a plain column (no FK) so
-- rows survive account deletion for historical reporting.
-- CreateTable
CREATE TABLE "ai_usage_events" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "feature" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheReadTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheWriteTokens" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_usage_events_createdAt_idx" ON "ai_usage_events"("createdAt");

-- CreateIndex
CREATE INDEX "ai_usage_events_feature_createdAt_idx" ON "ai_usage_events"("feature", "createdAt");

-- CreateIndex
CREATE INDEX "ai_usage_events_userId_createdAt_idx" ON "ai_usage_events"("userId", "createdAt");
