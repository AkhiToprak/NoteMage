-- AlterTable
ALTER TABLE "users" ADD COLUMN "quizReactionsMode" TEXT NOT NULL DEFAULT 'all';
ALTER TABLE "users" ADD COLUMN "quizReactionsAudio" BOOLEAN NOT NULL DEFAULT false;
