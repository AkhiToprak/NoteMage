-- Mage Revolution Phase 10 — per-context persistent panel threads + per-message
-- sidecar (resolved sources / action cards / reveal gate / answer mode).
--
-- MANUAL APPLY ON COOLIFY: additive + a backfill UPDATE; never auto-run.

-- AlterTable: NotebookChat.contextKey (surface key for panel resume)
ALTER TABLE "notebook_chats" ADD COLUMN "contextKey" TEXT;

-- AlterTable: ChatMessage.metadata (Mage panel turn sidecar; null → plain prose)
ALTER TABLE "chat_messages" ADD COLUMN "metadata" JSONB;

-- CreateIndex: panel resume reads the latest thread for (user, contextKey)
CREATE INDEX "notebook_chats_userId_contextKey_idx" ON "notebook_chats"("userId", "contextKey");

-- Backfill: stamp every existing thread with its surface key so the panel can
-- resume it. A chat homed in a notebook becomes 'notebook:{id}'; a notebook-less
-- chat (the old cross-pack / inbox / Mage-tutor threads) becomes 'global'.
UPDATE "notebook_chats"
SET "contextKey" = 'notebook:' || "notebookId"
WHERE "notebookId" IS NOT NULL AND "contextKey" IS NULL;

UPDATE "notebook_chats"
SET "contextKey" = 'global'
WHERE "notebookId" IS NULL AND "contextKey" IS NULL;
