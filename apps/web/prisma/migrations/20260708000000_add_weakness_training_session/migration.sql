-- CreateTable
CREATE TABLE "weakness_training_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourcePathId" TEXT,
    "conceptIds" TEXT[],
    "quizSetId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'assembling',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "weakness_training_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "weakness_training_sessions_userId_createdAt_idx" ON "weakness_training_sessions"("userId", "createdAt");
