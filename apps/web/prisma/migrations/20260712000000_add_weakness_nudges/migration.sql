-- AlterTable
ALTER TABLE "user_notification_preferences" ADD COLUMN     "weakSpotNudges" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "weakness_nudge_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "triggerKinds" TEXT[],
    "conceptIds" TEXT[],
    "windowKey" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'nudged',
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "weakness_nudge_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nudge_sweep_watermark" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "lastRunAt" TIMESTAMP(3),
    "lastCursor" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nudge_sweep_watermark_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "weakness_nudge_logs_userId_windowKey_channel_key" ON "weakness_nudge_logs"("userId", "windowKey", "channel");

-- CreateIndex
CREATE INDEX "weakness_nudge_logs_userId_sentAt_idx" ON "weakness_nudge_logs"("userId", "sentAt");

-- CreateIndex
CREATE INDEX "weakness_nudge_logs_state_idx" ON "weakness_nudge_logs"("state");
