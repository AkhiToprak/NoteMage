-- Exam Mode (Phase 3) — timed mock exams. Additive only: one new table that
-- layers config + readiness snapshots over the existing
-- PracticeSession → QuizSet → QuizAttempt spine (all pointers are bare columns,
-- no FK, so a mock survives the underlying set/attempt being pruned).

-- CreateTable
CREATE TABLE "mock_exams" (
    "id" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "practiceSessionId" TEXT,
    "quizSetId" TEXT,
    "quizAttemptId" TEXT,
    "config" JSONB NOT NULL,
    "readinessBefore" DOUBLE PRECISION,
    "readinessAfter" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'ready',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mock_exams_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mock_exams_examId_createdAt_idx" ON "mock_exams"("examId", "createdAt");

-- CreateIndex
CREATE INDEX "mock_exams_userId_createdAt_idx" ON "mock_exams"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "mock_exams" ADD CONSTRAINT "mock_exams_examId_fkey" FOREIGN KEY ("examId") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
