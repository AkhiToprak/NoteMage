-- DropIndex
DROP INDEX "background_jobs_lockedAt_idx";

-- DropIndex
DROP INDEX "notebook_chats_userId_idx";

-- DropIndex
DROP INDEX "flashcards_flashcardSetId_idx";

-- DropIndex
DROP INDEX "flashcards_nextReviewAt_idx";

-- DropIndex
DROP INDEX "notifications_userId_read_idx";

-- DropIndex
DROP INDEX "tags_name_idx";

-- DropIndex
DROP INDEX "study_minutes_userId_minute_idx";

-- DropIndex
DROP INDEX "achievements_userId_idx";

-- DropIndex
DROP INDEX "exam_scope_items_examId_idx";

-- CreateIndex
CREATE INDEX "flashcards_flashcardSetId_lastReviewAt_idx" ON "flashcards"("flashcardSetId", "lastReviewAt");

-- CreateIndex
CREATE INDEX "flashcards_flashcardSetId_nextReviewAt_idx" ON "flashcards"("flashcardSetId", "nextReviewAt");

-- CreateIndex
CREATE INDEX "quiz_answers_questionId_idx" ON "quiz_answers"("questionId");

-- CreateIndex
CREATE INDEX "concept_attempt_events_conceptId_idx" ON "concept_attempt_events"("conceptId");

-- CreateIndex
CREATE INDEX "concept_masteries_conceptId_idx" ON "concept_masteries"("conceptId");

-- CreateIndex
CREATE INDEX "notifications_read_createdAt_idx" ON "notifications"("read", "createdAt");

-- ============================================================================
-- MANUALLY-MANAGED SECTION (Prisma cannot express partial indexes or storage
-- params in schema.prisma). Everything above is Prisma-generated; everything
-- below is hand-written and intentionally not represented in schema.prisma.
-- `prisma migrate diff` in datamodel->datamodel mode (this repo's workflow)
-- never touches these. Do NOT let `prisma migrate dev` "fix drift" by dropping
-- them.
-- ============================================================================

-- Partial indexes for the hottest reads. Almost every notification ends up read
-- and almost every StudyPlan is 'ready', so a WHERE-filtered index covers only
-- the live rows -- a fraction of the table, and cheaper to maintain on write.

-- Unread badge: COUNT(userId, read=false) + latest-unread findFirst
-- (userId, read=false ORDER BY createdAt DESC). The DESC ordering is served
-- directly, so the findFirst is a single index row.
CREATE INDEX "notifications_unread_userId_createdAt_partial"
  ON "notifications" ("userId", "createdAt" DESC)
  WHERE "read" = false;

-- Pending cosmetic-unlocks poll: (userId, type='cosmetic_unlocked', read=false)
-- ORDER BY createdAt ASC. The single highest-call-volume statement in the audit.
CREATE INDEX "notifications_unread_userId_type_createdAt_partial"
  ON "notifications" ("userId", "type", "createdAt")
  WHERE "read" = false;

-- hasActivePathWork(): COUNT of a user's in-flight paths, run before the Redis
-- cache on every dashboard / my-path load. The partial predicate matches the
-- exact IN-list the query uses so the index holds only in-flight rows.
CREATE INDEX "study_plans_active_userId_partial"
  ON "study_plans" ("userId")
  WHERE "generationStatus" IN ('queued', 'generating', 'cancelling');

-- Per-table autovacuum tuning for the high-churn tables. Defaults (0.2 scale
-- factor) let dead tuples and index bloat build up on tables that see constant
-- inserts/updates; a tighter factor vacuums + analyzes them sooner, keeping the
-- indexes above lean and the planner's stats fresh.
ALTER TABLE "background_jobs"
  SET (autovacuum_vacuum_scale_factor = 0.05, autovacuum_analyze_scale_factor = 0.05);
ALTER TABLE "notifications"
  SET (autovacuum_vacuum_scale_factor = 0.05, autovacuum_analyze_scale_factor = 0.05);
ALTER TABLE "study_plans"
  SET (autovacuum_vacuum_scale_factor = 0.05, autovacuum_analyze_scale_factor = 0.05);
-- study_minutes is insert-only (heartbeats); the insert scale factor triggers a
-- vacuum after enough inserts so the visibility map stays current for the
-- index-only COUNT the heatmap/dashboard runs.
ALTER TABLE "study_minutes"
  SET (autovacuum_vacuum_insert_scale_factor = 0.05, autovacuum_analyze_scale_factor = 0.05);
