-- CreateTable
CREATE TABLE "exam_scope_items" (
    "id" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "itemType" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_scope_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "exam_scope_items_examId_idx" ON "exam_scope_items"("examId");

-- CreateIndex
CREATE UNIQUE INDEX "exam_scope_items_examId_itemType_itemId_key" ON "exam_scope_items"("examId", "itemType", "itemId");

-- AddForeignKey
ALTER TABLE "exam_scope_items" ADD CONSTRAINT "exam_scope_items_examId_fkey" FOREIGN KEY ("examId") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
