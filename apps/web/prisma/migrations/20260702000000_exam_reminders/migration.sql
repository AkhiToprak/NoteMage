-- Exam Mode (Phase 6) — DB-backed notification/reminder preferences.
-- Additive only: one new table, no changes to existing tables. A missing row
-- means "all defaults" (reminders on, email on), so existing users keep getting
-- exam reminders without a backfill.

-- CreateTable
CREATE TABLE "user_notification_preferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "examReminders" BOOLEAN NOT NULL DEFAULT true,
    "readinessAlerts" BOOLEAN NOT NULL DEFAULT true,
    "emailReminders" BOOLEAN NOT NULL DEFAULT true,
    "productUpdates" BOOLEAN NOT NULL DEFAULT true,
    "weeklyReport" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_notification_preferences_userId_key" ON "user_notification_preferences"("userId");

-- AddForeignKey
ALTER TABLE "user_notification_preferences" ADD CONSTRAINT "user_notification_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
