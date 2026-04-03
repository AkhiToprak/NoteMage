-- CreateEnum
CREATE TYPE "Tier" AS ENUM ('FREE', 'PLUS', 'PRO');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "tier" "Tier" NOT NULL DEFAULT 'FREE';

-- CreateTable
CREATE TABLE "usage_records" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "featureType" TEXT NOT NULL,
    "month" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usage_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "usage_records_userId_month_idx" ON "usage_records"("userId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "usage_records_userId_featureType_month_key" ON "usage_records"("userId", "featureType", "month");

-- AddForeignKey
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
