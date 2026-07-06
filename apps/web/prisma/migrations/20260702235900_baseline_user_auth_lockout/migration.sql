-- Baseline for the brute-force-lockout columns on "users". Like admin_audit_logs,
-- "users"."failedLoginAttempts" and "users"."lockedAt" were added out-of-band
-- (db push / manual SQL) on the live dev + prod databases — no migration in the
-- chain ever creates them. The 20260703000000_login_auth_security_remediation
-- migration then does `UPDATE "users" SET "failedLoginAttempts" = 0, "lockedAt" =
-- NULL`, which fails on a fresh replay because the columns do not exist. This
-- baseline adds them (matching schema.prisma: Int NOT NULL DEFAULT 0, and nullable
-- DateTime) so that migration can run on top exactly as it did on the live DBs.
--
-- ADD COLUMN IF NOT EXISTS makes both statements a clean no-op on the live DBs,
-- where the columns already exist and this file WILL run on the next migrate deploy.

-- AlterTable
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "lockedAt" TIMESTAMP(3);
