-- Intentionally a no-op. Earlier revisions of this file attempted to
-- backfill notebookId on study_plans / flashcard_sets / quiz_sets, but
-- crashed the production migrate step and bricked the deploy. The fix
-- is to land a passing migration here and apply the backfill manually
-- via the Supabase SQL editor (or a follow-up migration once the SQL
-- is verified against the live schema).

SELECT 1;
