-- CreateTable
CREATE TABLE "co_work_messages" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "co_work_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "co_work_messages_sessionId_createdAt_idx" ON "co_work_messages"("sessionId", "createdAt");

-- AddForeignKey
ALTER TABLE "co_work_messages" ADD CONSTRAINT "co_work_messages_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "co_work_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "co_work_messages" ADD CONSTRAINT "co_work_messages_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
