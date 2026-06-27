CREATE TABLE "background_jobs" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "lastError" TEXT,
    "dedupeKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "background_jobs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "background_jobs_dedupeKey_key" ON "background_jobs"("dedupeKey");
CREATE INDEX "background_jobs_status_runAt_idx" ON "background_jobs"("status", "runAt");
CREATE INDEX "background_jobs_lockedAt_idx" ON "background_jobs"("lockedAt");
CREATE INDEX "background_jobs_kind_status_idx" ON "background_jobs"("kind", "status");
