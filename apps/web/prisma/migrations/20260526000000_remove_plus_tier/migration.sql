-- Retire the PLUS tier. Pre-launch — no PLUS accounts are expected, but move
-- any stray rows to PRO first so recreating the enum below cannot fail.
UPDATE "User" SET "tier" = 'PRO' WHERE "tier" = 'PLUS';
UPDATE "User" SET "pendingTier" = 'PRO' WHERE "pendingTier" = 'PLUS';

-- Postgres has no `ALTER TYPE ... DROP VALUE`, so recreate the enum without PLUS.
ALTER TYPE "Tier" RENAME TO "Tier_old";
CREATE TYPE "Tier" AS ENUM ('FREE', 'PRO');
ALTER TABLE "User" ALTER COLUMN "tier" DROP DEFAULT;
ALTER TABLE "User"
  ALTER COLUMN "tier" TYPE "Tier" USING ("tier"::text::"Tier"),
  ALTER COLUMN "pendingTier" TYPE "Tier" USING ("pendingTier"::text::"Tier");
ALTER TABLE "User" ALTER COLUMN "tier" SET DEFAULT 'FREE';
DROP TYPE "Tier_old";
