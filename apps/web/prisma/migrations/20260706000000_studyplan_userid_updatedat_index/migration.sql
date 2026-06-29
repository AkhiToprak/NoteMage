-- Replace the single-column userId index with a composite (userId, updatedAt DESC).
-- The path overview (/my-path) and dashboard load the user's plans with
-- `where userId order by updatedAt desc`; the old `study_plans_userId_idx` could
-- satisfy the filter but not the sort, so Postgres fetched the user's rows and
-- sorted them in memory on every (uncached) request. The composite serves the
-- ordered scan directly, and still covers bare `where userId` lookups via its
-- leftmost prefix — so dropping the single-column index loses nothing.

-- DropIndex
DROP INDEX "study_plans_userId_idx";

-- CreateIndex
CREATE INDEX "study_plans_userId_updatedAt_idx" ON "study_plans"("userId", "updatedAt" DESC);
