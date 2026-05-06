-- Add cosmetics-related columns to users and create user_cosmetics table.
-- Phase 1 of the XP unlockables system. See src/lib/cosmetics/catalog.ts
-- for the canonical catalog of slugs that cosmeticId/equipped*Id reference.

-- AlterTable
ALTER TABLE "users"
  ADD COLUMN "nameStyle" JSONB,
  ADD COLUMN "equippedTitleId" TEXT,
  ADD COLUMN "equippedFrameId" TEXT,
  ADD COLUMN "equippedBackgroundId" TEXT;

-- CreateTable
CREATE TABLE "user_cosmetics" (
    "userId" TEXT NOT NULL,
    "cosmeticId" TEXT NOT NULL,
    "unlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_cosmetics_pkey" PRIMARY KEY ("userId","cosmeticId")
);

-- CreateIndex
CREATE INDEX "user_cosmetics_userId_idx" ON "user_cosmetics"("userId");

-- AddForeignKey
ALTER TABLE "user_cosmetics"
  ADD CONSTRAINT "user_cosmetics_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
