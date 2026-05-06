-- AlterTable
ALTER TABLE "chat_messages" ADD COLUMN     "chatId" TEXT;

-- CreateTable
CREATE TABLE "notebook_chats" (
    "id" TEXT NOT NULL,
    "notebookId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'New Chat',
    "contextPageIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "contextDocIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notebook_chats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notebook_chats_notebookId_idx" ON "notebook_chats"("notebookId");

-- CreateIndex
CREATE INDEX "chat_messages_chatId_idx" ON "chat_messages"("chatId");

-- AddForeignKey
ALTER TABLE "notebook_chats" ADD CONSTRAINT "notebook_chats_notebookId_fkey" FOREIGN KEY ("notebookId") REFERENCES "notebooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "notebook_chats"("id") ON DELETE CASCADE ON UPDATE CASCADE;
