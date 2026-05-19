-- Phase 10 — persist the exact material ids a learn path was generated from,
-- so Stage B can rebuild the same source corpus the structure call was
-- grounded in. Additive, defaulted: existing rows backfill to an empty array.
ALTER TABLE "study_plans" ADD COLUMN "materialIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
