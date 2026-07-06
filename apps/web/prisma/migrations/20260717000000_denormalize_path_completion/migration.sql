-- ============================================================================
-- Denormalize path-completion state (incremental view maintenance).
--
-- The achievement gather used to derive "phase/path/section complete" with
-- 3-level nested-every anti-joins over study_plans -> study_phases ->
-- checkpoint_slots -> checkpoint_activities. Those can't be indexed away (they
-- must touch every child to prove none is unmatched) and were the heaviest part
-- of the gather. Here we maintain a boolean rollup at each level, kept correct
-- by DB triggers so it CANNOT drift regardless of which code path writes.
--
-- Semantics preserved EXACTLY from the old queries:
--   slot.allActivitiesDone := (>=1 activity) AND (every activity completed)
--   phase.allSlotsDone      := (>=1 slot)     AND (every slot allActivitiesDone)
--   plan.allPhasesDone      := (>=1 phase)    AND (every phase allSlotsDone)
-- (This is achievement-completion, NOT the stricter gating "completed" which
--  also requires the assessment pass gate — a deliberately different notion.)
--
-- Also: users.flashcardRepetitionsSum := SUM(flashcards.repetitions) for the
-- user, so the "spaced repetition" achievement reads one column instead of a
-- join + aggregate over every card.
--
-- The trigger functions + triggers below are hand-written (Prisma can't express
-- them) and intentionally not in schema.prisma. This repo generates migrations
-- via `migrate diff` in datamodel->datamodel mode, which never touches them. Do
-- NOT let `prisma migrate dev` "fix drift" by dropping them.
-- ============================================================================

-- AlterTable (Prisma-generated)
ALTER TABLE "users" ADD COLUMN     "flashcardRepetitionsSum" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "study_plans" ADD COLUMN     "allPhasesDone" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "study_phases" ADD COLUMN     "allSlotsDone" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "checkpoint_slots" ADD COLUMN     "allActivitiesDone" BOOLEAN NOT NULL DEFAULT false;

-- ============================================================================
-- MANUALLY-MANAGED SECTION (functions + triggers + backfill).
-- ============================================================================

-- ── Per-parent recompute functions (called by the triggers). Each recomputes
--    one node's rollup as a pure function of its children, and only writes when
--    the value actually changes (so a no-op change never cascades upward). ────

CREATE OR REPLACE FUNCTION nm_recompute_slot_done(p_slot_id text) RETURNS void AS $$
DECLARE v_done boolean;
BEGIN
  SELECT COUNT(a.id) > 0 AND COUNT(a.id) FILTER (WHERE NOT a."completed") = 0
    INTO v_done
    FROM checkpoint_activities a
    WHERE a."slotId" = p_slot_id;
  UPDATE checkpoint_slots
    SET "allActivitiesDone" = v_done
    WHERE id = p_slot_id AND "allActivitiesDone" IS DISTINCT FROM v_done;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION nm_recompute_phase_done(p_phase_id text) RETURNS void AS $$
DECLARE v_done boolean;
BEGIN
  SELECT COUNT(s.id) > 0 AND COUNT(s.id) FILTER (WHERE NOT s."allActivitiesDone") = 0
    INTO v_done
    FROM checkpoint_slots s
    WHERE s."phaseId" = p_phase_id;
  UPDATE study_phases
    SET "allSlotsDone" = v_done
    WHERE id = p_phase_id AND "allSlotsDone" IS DISTINCT FROM v_done;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION nm_recompute_plan_done(p_plan_id text) RETURNS void AS $$
DECLARE v_done boolean;
BEGIN
  SELECT COUNT(p.id) > 0 AND COUNT(p.id) FILTER (WHERE NOT p."allSlotsDone") = 0
    INTO v_done
    FROM study_phases p
    WHERE p."planId" = p_plan_id;
  UPDATE study_plans
    SET "allPhasesDone" = v_done
    WHERE id = p_plan_id AND "allPhasesDone" IS DISTINCT FROM v_done;
END;
$$ LANGUAGE plpgsql;

-- ── Bulk reheal — recomputes the whole tree bottom-up + the flashcard sums.
--    Used for the initial backfill below, and callable anytime to repair drift
--    (e.g. after a bulk data fix or if triggers were ever disabled):
--        SELECT nm_reheal_completion_denorm();
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION nm_reheal_completion_denorm() RETURNS void AS $$
BEGIN
  UPDATE checkpoint_slots s SET "allActivitiesDone" = c.done
  FROM (
    SELECT sl.id,
           (COUNT(a.id) > 0 AND COUNT(a.id) FILTER (WHERE NOT a."completed") = 0) AS done
    FROM checkpoint_slots sl
    LEFT JOIN checkpoint_activities a ON a."slotId" = sl.id
    GROUP BY sl.id
  ) c
  WHERE s.id = c.id AND s."allActivitiesDone" IS DISTINCT FROM c.done;

  UPDATE study_phases p SET "allSlotsDone" = c.done
  FROM (
    SELECT ph.id,
           (COUNT(sl.id) > 0 AND COUNT(sl.id) FILTER (WHERE NOT sl."allActivitiesDone") = 0) AS done
    FROM study_phases ph
    LEFT JOIN checkpoint_slots sl ON sl."phaseId" = ph.id
    GROUP BY ph.id
  ) c
  WHERE p.id = c.id AND p."allSlotsDone" IS DISTINCT FROM c.done;

  UPDATE study_plans pl SET "allPhasesDone" = c.done
  FROM (
    SELECT p.id,
           (COUNT(ph.id) > 0 AND COUNT(ph.id) FILTER (WHERE NOT ph."allSlotsDone") = 0) AS done
    FROM study_plans p
    LEFT JOIN study_phases ph ON ph."planId" = p.id
    GROUP BY p.id
  ) c
  WHERE pl.id = c.id AND pl."allPhasesDone" IS DISTINCT FROM c.done;

  UPDATE users u SET "flashcardRepetitionsSum" = c.total
  FROM (
    SELECT fs."userId" AS uid, COALESCE(SUM(f."repetitions"), 0)::int AS total
    FROM flashcard_sets fs
    LEFT JOIN flashcards f ON f."flashcardSetId" = fs.id
    GROUP BY fs."userId"
  ) c
  WHERE u.id = c.uid AND u."flashcardRepetitionsSum" IS DISTINCT FROM c.total;

  -- Users with no flashcard sets at all must read 0.
  UPDATE users u SET "flashcardRepetitionsSum" = 0
  WHERE u."flashcardRepetitionsSum" <> 0
    AND NOT EXISTS (SELECT 1 FROM flashcard_sets fs WHERE fs."userId" = u.id);
END;
$$ LANGUAGE plpgsql;

-- Initial backfill. Runs BEFORE the triggers exist, so it sets the whole tree
-- in three bulk passes with no per-row cascade.
SELECT nm_reheal_completion_denorm();

-- ── Trigger functions. Each fires on its base table and recomputes the parent;
--    the parent's own UPDATE then fires the next trigger up, so a real change
--    cascades slot -> phase -> plan, and a no-op change stops (IS DISTINCT FROM
--    guard in the recompute functions). ──────────────────────────────────────

CREATE OR REPLACE FUNCTION nm_trg_activity_rollup() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM nm_recompute_slot_done(OLD."slotId");
    RETURN OLD;
  END IF;
  PERFORM nm_recompute_slot_done(NEW."slotId");
  IF TG_OP = 'UPDATE' AND NEW."slotId" IS DISTINCT FROM OLD."slotId" THEN
    PERFORM nm_recompute_slot_done(OLD."slotId");
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION nm_trg_slot_rollup() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM nm_recompute_phase_done(OLD."phaseId");
    RETURN OLD;
  END IF;
  PERFORM nm_recompute_phase_done(NEW."phaseId");
  IF TG_OP = 'UPDATE' AND NEW."phaseId" IS DISTINCT FROM OLD."phaseId" THEN
    PERFORM nm_recompute_phase_done(OLD."phaseId");
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION nm_trg_phase_rollup() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM nm_recompute_plan_done(OLD."planId");
    RETURN OLD;
  END IF;
  PERFORM nm_recompute_plan_done(NEW."planId");
  IF TG_OP = 'UPDATE' AND NEW."planId" IS DISTINCT FROM OLD."planId" THEN
    PERFORM nm_recompute_plan_done(OLD."planId");
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Flashcard repetitions -> users.flashcardRepetitionsSum, delta-maintained.
-- Handles SM-2 resets (repetitions -> 0 gives a negative delta). Cards never
-- move between sets in this app, so no set-move handling is needed.
CREATE OR REPLACE FUNCTION nm_trg_flashcard_reps_rollup() RETURNS trigger AS $$
DECLARE
  v_user_id text;
  v_delta   int;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_delta := COALESCE(NEW."repetitions", 0);
    SELECT "userId" INTO v_user_id FROM flashcard_sets WHERE id = NEW."flashcardSetId";
  ELSIF TG_OP = 'DELETE' THEN
    v_delta := -COALESCE(OLD."repetitions", 0);
    SELECT "userId" INTO v_user_id FROM flashcard_sets WHERE id = OLD."flashcardSetId";
  ELSE
    v_delta := COALESCE(NEW."repetitions", 0) - COALESCE(OLD."repetitions", 0);
    SELECT "userId" INTO v_user_id FROM flashcard_sets WHERE id = NEW."flashcardSetId";
  END IF;

  IF v_user_id IS NOT NULL AND v_delta <> 0 THEN
    UPDATE users
      SET "flashcardRepetitionsSum" = GREATEST(0, "flashcardRepetitionsSum" + v_delta)
      WHERE id = v_user_id;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── Triggers ────────────────────────────────────────────────────────────────
CREATE TRIGGER trg_nm_activity_rollup
  AFTER INSERT OR DELETE OR UPDATE OF "completed", "slotId" ON checkpoint_activities
  FOR EACH ROW EXECUTE FUNCTION nm_trg_activity_rollup();

CREATE TRIGGER trg_nm_slot_rollup
  AFTER INSERT OR DELETE OR UPDATE OF "allActivitiesDone", "phaseId" ON checkpoint_slots
  FOR EACH ROW EXECUTE FUNCTION nm_trg_slot_rollup();

CREATE TRIGGER trg_nm_phase_rollup
  AFTER INSERT OR DELETE OR UPDATE OF "allSlotsDone", "planId" ON study_phases
  FOR EACH ROW EXECUTE FUNCTION nm_trg_phase_rollup();

CREATE TRIGGER trg_nm_flashcard_reps_rollup
  AFTER INSERT OR DELETE OR UPDATE OF "repetitions", "flashcardSetId" ON flashcards
  FOR EACH ROW EXECUTE FUNCTION nm_trg_flashcard_reps_rollup();
