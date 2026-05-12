-- Grading feature — track the best percentage ever scored on a checkpoint
-- slot's assessment. Null for slots never attempted; updated on every
-- AssessmentAttempt write (max-merge with prior value).
--
-- Pure DDL by design — the prior backfill migration crashed prod, so we
-- skip the per-row backfill and let the renderer fall back to a coarser
-- star-derived grade for legacy rows. New attempts will populate this
-- column going forward.

ALTER TABLE "checkpoint_slots" ADD COLUMN "bestPercentage" DOUBLE PRECISION;
