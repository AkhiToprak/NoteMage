-- AlterTable
ALTER TABLE "notebook_chats" ADD COLUMN     "allowWebSearch" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "allowGeneralKnowledge" BOOLEAN NOT NULL DEFAULT false;
