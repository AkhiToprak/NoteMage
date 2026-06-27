-- Advanced query indexes inspired by the live query shapes:
-- - community-library subject filtering over SharedPath.subjects[]
-- - ILIKE '%term%' path title/description search
-- - hot background worker polling over non-terminal jobs only

-- Prisma can represent this one in schema.prisma as @@index([subjects], type: Gin),
-- but we keep IF NOT EXISTS here so retrying a partially-applied migration is safe.
CREATE INDEX IF NOT EXISTS "shared_paths_subjects_idx"
ON "shared_paths" USING GIN ("subjects");

-- Path search uses Prisma `contains` + `mode: 'insensitive'`, which maps to
-- ILIKE-style predicates that need pg_trgm to avoid broad scans.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "shared_paths_title_trgm_idx"
ON "shared_paths" USING GIN ("title" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "shared_paths_description_trgm_idx"
ON "shared_paths" USING GIN ("description" gin_trgm_ops);

-- The worker repeatedly polls queued runnable jobs and stale running jobs.
-- Partial indexes keep succeeded/failed history out of the hot lookup path.
CREATE INDEX IF NOT EXISTS "background_jobs_queued_runAt_createdAt_idx"
ON "background_jobs" ("runAt", "createdAt")
WHERE "status" = 'queued';

CREATE INDEX IF NOT EXISTS "background_jobs_running_lockedAt_idx"
ON "background_jobs" ("lockedAt")
WHERE "status" = 'running';
