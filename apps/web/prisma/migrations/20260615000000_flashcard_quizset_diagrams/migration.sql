-- Path-diagrams revival (Phase 3): theory-generated structured diagrams
-- (PathDiagram[]: timeline/steps/comparison/cycle) are reused — zero AI tokens —
-- onto a slot's flashcard and quiz activities, stored set-level and rendered as a
-- collapsed reference panel. Set-level (slot-scoped reference graphics, not
-- per-item illustrations), so one nullable JSONB column on each set table rather
-- than per-card/per-question rows. Nullable so sets without diagrams are
-- unaffected.
-- AlterTable
ALTER TABLE "flashcard_sets" ADD COLUMN     "diagrams" JSONB;

-- AlterTable
ALTER TABLE "quiz_sets" ADD COLUMN     "diagrams" JSONB;
