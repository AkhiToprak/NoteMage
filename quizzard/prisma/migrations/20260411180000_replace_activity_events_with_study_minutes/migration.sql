-- Replace per-action ActivityEvent counters with per-minute presence rows.
-- The heatmap now visualises "minutes the app was open" instead of an
-- aggregated action count, so the old activity_events table is dropped and a
-- new study_minutes table takes its place. Each row = one unique minute the
-- user had the app open; the heartbeat endpoint upserts with no-op on
-- conflict so multi-tab pings don't double count.

-- DropTable
DROP TABLE IF EXISTS "activity_events";

-- CreateTable
CREATE TABLE "study_minutes" (
    "userId" TEXT NOT NULL,
    "minute" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "study_minutes_pkey" PRIMARY KEY ("userId","minute")
);

-- CreateIndex
CREATE INDEX "study_minutes_userId_minute_idx" ON "study_minutes"("userId", "minute");

-- AddForeignKey
ALTER TABLE "study_minutes"
  ADD CONSTRAINT "study_minutes_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
