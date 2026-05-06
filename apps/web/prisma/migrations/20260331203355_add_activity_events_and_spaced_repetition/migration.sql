-- AlterTable
ALTER TABLE "flashcard_sets" ADD COLUMN     "sectionId" TEXT,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'ai',
ALTER COLUMN "chatId" DROP NOT NULL,
ALTER COLUMN "messageId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "flashcards" ADD COLUMN     "easeFactor" DOUBLE PRECISION NOT NULL DEFAULT 2.5,
ADD COLUMN     "interval" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastReviewAt" TIMESTAMP(3),
ADD COLUMN     "nextReviewAt" TIMESTAMP(3),
ADD COLUMN     "repetitions" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "notebooks" ADD COLUMN     "folderId" TEXT;

-- AlterTable
ALTER TABLE "shared_notebooks" ADD COLUMN     "content" TEXT,
ADD COLUMN     "coverImageUrl" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "lastSeenAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "notebook_folders" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "color" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notebook_folders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flashcard_images" (
    "id" TEXT NOT NULL,
    "flashcardId" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "flashcard_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quiz_sets" (
    "id" TEXT NOT NULL,
    "notebookId" TEXT NOT NULL,
    "chatId" TEXT,
    "messageId" TEXT,
    "title" TEXT NOT NULL,
    "sectionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quiz_sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quiz_questions" (
    "id" TEXT NOT NULL,
    "quizSetId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "options" TEXT[],
    "correctIndex" INTEGER NOT NULL,
    "hint" TEXT,
    "correctExplanation" TEXT,
    "wrongExplanation" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quiz_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shared_notebook_tags" (
    "id" TEXT NOT NULL,
    "sharedNotebookId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "shared_notebook_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notebook_downloads" (
    "id" TEXT NOT NULL,
    "sharedNotebookId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notebook_downloads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notebook_ratings" (
    "id" TEXT NOT NULL,
    "sharedNotebookId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notebook_ratings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notebook_views" (
    "id" TEXT NOT NULL,
    "sharedNotebookId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notebook_views_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notebook_comments" (
    "id" TEXT NOT NULL,
    "sharedNotebookId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "parentCommentId" TEXT,
    "content" VARCHAR(1000) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notebook_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notebook_comment_votes" (
    "id" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "value" INTEGER NOT NULL,

    CONSTRAINT "notebook_comment_votes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "friend_activities" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "targetName" TEXT NOT NULL,
    "targetColor" TEXT,
    "targetId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "friend_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_events" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "type" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notebook_folders_userId_idx" ON "notebook_folders"("userId");

-- CreateIndex
CREATE INDEX "notebook_folders_parentId_idx" ON "notebook_folders"("parentId");

-- CreateIndex
CREATE INDEX "flashcard_images_flashcardId_idx" ON "flashcard_images"("flashcardId");

-- CreateIndex
CREATE INDEX "quiz_sets_notebookId_idx" ON "quiz_sets"("notebookId");

-- CreateIndex
CREATE INDEX "quiz_sets_chatId_idx" ON "quiz_sets"("chatId");

-- CreateIndex
CREATE INDEX "quiz_sets_sectionId_idx" ON "quiz_sets"("sectionId");

-- CreateIndex
CREATE INDEX "quiz_questions_quizSetId_idx" ON "quiz_questions"("quizSetId");

-- CreateIndex
CREATE UNIQUE INDEX "tags_name_key" ON "tags"("name");

-- CreateIndex
CREATE INDEX "tags_name_idx" ON "tags"("name");

-- CreateIndex
CREATE INDEX "shared_notebook_tags_tagId_idx" ON "shared_notebook_tags"("tagId");

-- CreateIndex
CREATE UNIQUE INDEX "shared_notebook_tags_sharedNotebookId_tagId_key" ON "shared_notebook_tags"("sharedNotebookId", "tagId");

-- CreateIndex
CREATE UNIQUE INDEX "notebook_downloads_sharedNotebookId_userId_key" ON "notebook_downloads"("sharedNotebookId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "notebook_ratings_sharedNotebookId_userId_key" ON "notebook_ratings"("sharedNotebookId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "notebook_views_sharedNotebookId_userId_key" ON "notebook_views"("sharedNotebookId", "userId");

-- CreateIndex
CREATE INDEX "notebook_comments_sharedNotebookId_createdAt_idx" ON "notebook_comments"("sharedNotebookId", "createdAt");

-- CreateIndex
CREATE INDEX "notebook_comments_parentCommentId_idx" ON "notebook_comments"("parentCommentId");

-- CreateIndex
CREATE UNIQUE INDEX "notebook_comment_votes_commentId_userId_key" ON "notebook_comment_votes"("commentId", "userId");

-- CreateIndex
CREATE INDEX "friend_activities_userId_createdAt_idx" ON "friend_activities"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "activity_events_userId_date_idx" ON "activity_events"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "activity_events_userId_date_type_key" ON "activity_events"("userId", "date", "type");

-- CreateIndex
CREATE INDEX "flashcard_sets_sectionId_idx" ON "flashcard_sets"("sectionId");

-- CreateIndex
CREATE INDEX "notebooks_folderId_idx" ON "notebooks"("folderId");

-- AddForeignKey
ALTER TABLE "notebook_folders" ADD CONSTRAINT "notebook_folders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notebook_folders" ADD CONSTRAINT "notebook_folders_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "notebook_folders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notebooks" ADD CONSTRAINT "notebooks_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "notebook_folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flashcard_sets" ADD CONSTRAINT "flashcard_sets_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flashcard_images" ADD CONSTRAINT "flashcard_images_flashcardId_fkey" FOREIGN KEY ("flashcardId") REFERENCES "flashcards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_sets" ADD CONSTRAINT "quiz_sets_notebookId_fkey" FOREIGN KEY ("notebookId") REFERENCES "notebooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_sets" ADD CONSTRAINT "quiz_sets_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "notebook_chats"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_sets" ADD CONSTRAINT "quiz_sets_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_questions" ADD CONSTRAINT "quiz_questions_quizSetId_fkey" FOREIGN KEY ("quizSetId") REFERENCES "quiz_sets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shared_notebook_tags" ADD CONSTRAINT "shared_notebook_tags_sharedNotebookId_fkey" FOREIGN KEY ("sharedNotebookId") REFERENCES "shared_notebooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shared_notebook_tags" ADD CONSTRAINT "shared_notebook_tags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notebook_downloads" ADD CONSTRAINT "notebook_downloads_sharedNotebookId_fkey" FOREIGN KEY ("sharedNotebookId") REFERENCES "shared_notebooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notebook_downloads" ADD CONSTRAINT "notebook_downloads_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notebook_ratings" ADD CONSTRAINT "notebook_ratings_sharedNotebookId_fkey" FOREIGN KEY ("sharedNotebookId") REFERENCES "shared_notebooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notebook_ratings" ADD CONSTRAINT "notebook_ratings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notebook_views" ADD CONSTRAINT "notebook_views_sharedNotebookId_fkey" FOREIGN KEY ("sharedNotebookId") REFERENCES "shared_notebooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notebook_views" ADD CONSTRAINT "notebook_views_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notebook_comments" ADD CONSTRAINT "notebook_comments_sharedNotebookId_fkey" FOREIGN KEY ("sharedNotebookId") REFERENCES "shared_notebooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notebook_comments" ADD CONSTRAINT "notebook_comments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notebook_comments" ADD CONSTRAINT "notebook_comments_parentCommentId_fkey" FOREIGN KEY ("parentCommentId") REFERENCES "notebook_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notebook_comment_votes" ADD CONSTRAINT "notebook_comment_votes_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "notebook_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notebook_comment_votes" ADD CONSTRAINT "notebook_comment_votes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "friend_activities" ADD CONSTRAINT "friend_activities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
