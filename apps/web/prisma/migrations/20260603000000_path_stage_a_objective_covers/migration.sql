-- Stage A refinement: per-slot learning objective + checkpoint "covers" links.
-- `objective` is the measurable, verb-first outcome the slot's quiz targets
-- (distinct from `description`, the topicHint). `coversSlotIds` records, for
-- review/assessment slots, the earlier slots in the same section the
-- checkpoint consolidates — resolved from Stage A's section-local indices.
ALTER TABLE "checkpoint_slots" ADD COLUMN "objective" TEXT;
ALTER TABLE "checkpoint_slots" ADD COLUMN "coversSlotIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
