-- Baseline for "admin_audit_logs": the table was originally created out-of-band
-- (db push / manual SQL) on the live dev + prod databases, so no migration in the
-- chain ever created it. The 20260609000000 migration then ALTERs it (nullable
-- adminId, FK CASCADE -> SET NULL), which fails on a fresh replay because the
-- table does not exist. This migration recreates the table in its PRE-20260609
-- shape (adminId NOT NULL, FK ON DELETE CASCADE, the 3 indexes) so 20260609 can
-- apply on top exactly as it did on the live DBs.
--
-- Every statement is idempotent (IF NOT EXISTS / guarded DO block) because on the
-- live DBs this file WILL run on the next `migrate deploy` even though the table,
-- indexes, and FK already exist there — it must be a clean no-op in that case.

-- CreateTable
CREATE TABLE IF NOT EXISTS "admin_audit_logs" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "details" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "admin_audit_logs_adminId_idx" ON "admin_audit_logs"("adminId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "admin_audit_logs_action_idx" ON "admin_audit_logs"("action");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "admin_audit_logs_createdAt_idx" ON "admin_audit_logs"("createdAt");

-- AddForeignKey (pre-20260609 CASCADE variant). ADD CONSTRAINT has no IF NOT
-- EXISTS, so guard it: only add when a constraint of this name is absent. On live
-- DBs the SET NULL variant already exists under the same name, so this no-ops.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'admin_audit_logs_adminId_fkey'
    ) THEN
        ALTER TABLE "admin_audit_logs"
            ADD CONSTRAINT "admin_audit_logs_adminId_fkey"
            FOREIGN KEY ("adminId") REFERENCES "users"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
