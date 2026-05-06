-- AlterTable
ALTER TABLE "users" ADD COLUMN     "pendingTier" "Tier",
ADD COLUMN     "subscriptionPeriodEnd" TIMESTAMP(3);
