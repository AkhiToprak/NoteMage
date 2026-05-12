-- Phase 9.6 — Final schema cleanup: ChatMessage.notebookId becomes
-- nullable so chats with no primary notebook stop stamping every
-- message with the Inbox notebook id as a placeholder. The FK reshapes
-- from ON DELETE Cascade → ON DELETE SET NULL so that deleting a
-- notebook no longer cascades into chat history rows that may belong
-- to a chat spanning other notebooks.
ALTER TABLE "chat_messages" DROP CONSTRAINT "chat_messages_notebookId_fkey";
ALTER TABLE "chat_messages" ALTER COLUMN "notebookId" DROP NOT NULL;
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_notebookId_fkey"
  FOREIGN KEY ("notebookId") REFERENCES "notebooks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
