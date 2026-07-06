-- AlterTable
ALTER TABLE "users" ADD COLUMN     "trialEndsAt" TIMESTAMP(3),
ADD COLUMN     "pausedAt" TIMESTAMP(3),
ADD COLUMN     "pendingWelcome" BOOLEAN NOT NULL DEFAULT false;

-- Drop the free tier: comp every current free user to Pro forever so nothing
-- breaks for them (burners + friends). One-time backfill — new signups instead
-- get a 7-day trial via trialGrant() (src/lib/entitlement.ts). Idempotent: the
-- WHERE clause skips anyone already on a paid/comped source.
UPDATE "users" SET "tier" = 'PRO', "entitlementSource" = 'MANUAL'
WHERE "tier" = 'FREE' AND "entitlementSource" IS NULL;
