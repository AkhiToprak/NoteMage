-- CreateEnum
CREATE TYPE "BillingInterval" AS ENUM ('weekly', 'monthly', 'yearly');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "billingInterval" "BillingInterval";
