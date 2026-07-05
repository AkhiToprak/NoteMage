-- CreateEnum
CREATE TYPE "BillingInterval" AS ENUM ('weekly', 'monthly', 'yearly');

-- AlterTable
ALTER TABLE "users" ADD COLUMN "billingInterval" "BillingInterval";
