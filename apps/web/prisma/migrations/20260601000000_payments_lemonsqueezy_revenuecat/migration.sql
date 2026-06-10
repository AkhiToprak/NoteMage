-- Payments: Lemon Squeezy (web/desktop) + RevenueCat (iOS). Decouples payment
-- source from the account — `tier` stays the single feature gate while the new
-- columns record WHICH provider backs it, the billing period, grace window, and
-- the provider-specific customer/subscription ids. Drops the dead Stripe columns
-- (Stripe was removed in code; pre-launch, no rows to preserve). Adds a
-- webhook_events idempotency ledger shared by both providers' webhooks.
-- The EntitlementSource enum keeps an inert PADDLE value (Paddle was evaluated
-- then dropped) so no enum-recreate is needed.

-- CreateEnum
CREATE TYPE "EntitlementSource" AS ENUM ('APPLE_IAP', 'PADDLE', 'LEMON_SQUEEZY', 'MANUAL');

-- DropIndex
DROP INDEX "users_stripeCustomerId_key";

-- DropIndex
DROP INDEX "users_stripeSubscriptionId_key";

-- AlterTable
ALTER TABLE "users" DROP COLUMN "stripeCustomerId",
DROP COLUMN "stripeSubscriptionId",
ADD COLUMN     "appleOriginalTransactionId" TEXT,
ADD COLUMN     "entitlementSource" "EntitlementSource",
ADD COLUMN     "inGracePeriod" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lemonSqueezyCustomerId" TEXT,
ADD COLUMN     "lemonSqueezySubscriptionId" TEXT,
ADD COLUMN     "revenueCatAppUserId" TEXT;

-- CreateTable
CREATE TABLE "webhook_events" (
    "provider" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("provider","eventId")
);

-- CreateIndex
CREATE INDEX "webhook_events_receivedAt_idx" ON "webhook_events"("receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "users_lemonSqueezyCustomerId_key" ON "users"("lemonSqueezyCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "users_lemonSqueezySubscriptionId_key" ON "users"("lemonSqueezySubscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "users_revenueCatAppUserId_key" ON "users"("revenueCatAppUserId");

-- CreateIndex
CREATE UNIQUE INDEX "users_appleOriginalTransactionId_key" ON "users"("appleOriginalTransactionId");
