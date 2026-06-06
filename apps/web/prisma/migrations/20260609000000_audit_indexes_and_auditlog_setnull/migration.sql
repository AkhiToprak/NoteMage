-- NM3-19: audit-log integrity — an admin must not erase their own trail by
-- self-deleting. Make adminId nullable and switch the FK from CASCADE to SET NULL
-- so deleting an admin tombstones (null actor) their AdminAuditLog rows instead
-- of cascading them away.
-- DropForeignKey
ALTER TABLE "admin_audit_logs" DROP CONSTRAINT "admin_audit_logs_adminId_fkey";

-- AlterTable
ALTER TABLE "admin_audit_logs" ALTER COLUMN "adminId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- NM3-45: the hot monthly token-budget aggregation filters chat_messages by
-- userId and ranges createdAt. Replace the userId-only index with a compound
-- (userId, createdAt) — it also serves the former userId-only lookups.
-- DropIndex
DROP INDEX "chat_messages_userId_idx";

-- CreateIndex
CREATE INDEX "chat_messages_userId_createdAt_idx" ON "chat_messages"("userId", "createdAt");

-- NM3-13: study-plans filtering does a `contextNotebookIds @> {id}` array
-- contains-search; a GIN index makes it index-backed instead of a seq scan.
-- CreateIndex
CREATE INDEX "study_plans_contextNotebookIds_idx" ON "study_plans" USING GIN ("contextNotebookIds");
