# DB performance runbook

Repeatable checks so DB efficiency doesn't silently regress as features ship.
Grounded in the workload-driven index-tuning research (AutoAdmin / CoPhy) and the
2026-07-06 load audit.

## `index-advisor.sql` — run every few weeks (or after a feature adds new queries)

Run it in the **Supabase SQL editor** (needs privileges to `create extension`).
It:

1. Enables `hypopg` + `index_advisor` + `pg_stat_statements` (idempotent).
2. Lists the statements costing the most total time — where the DB time goes.
3. Lets you ask `index_advisor()` which indexes would help a given query
   (use **literal** values — parameterized `$1` queries can't be planned).
4. Lets you test a candidate index hypothetically with `hypopg` before building it.
5. Flags unused indexes (drop candidates) and heavy sequential scans (missing-index candidates).

Anything it recommends: check it against the leading-column rule, then add it via a
Prisma migration (see `prisma/migrations/20260716000000_db_load_audit_indexes/` for
the pattern — Prisma-generated DDL first, hand-written partial indexes / storage
params in the clearly-marked manual section below it).

## What the load audit already applied (2026-07-06)

- Composite + FK indexes for the hot query shapes; dropped redundant duplicates.
- **Partial** indexes (`WHERE read = false`, `WHERE generationStatus IN (...)`) for the
  unread-notification and active-path reads — they index only the live rows.
- Per-table **autovacuum** tuning on the high-churn tables (`notifications`,
  `background_jobs`, `study_minutes`, `study_plans`).
- App-level: visibility-gated pollers, cached achievement-stats gather, request-memoized
  session lookup, narrowed `select`s, notification retention prune.

## Incremental completion denormalization (done — migration 20260717000000)

The achievement checker's three heaviest queries were nested-every anti-joins over
the path tree (phase/path/section complete). They're now flat reads of
trigger-maintained boolean columns:

- `checkpoint_slots.allActivitiesDone`, `study_phases.allSlotsDone`,
  `study_plans.allPhasesDone` — rolled up bottom-up by DB triggers.
- `users.flashcardRepetitionsSum` — the "spaced repetition" metric, delta-maintained.

Triggers (not app-level counters) maintain these, so they **cannot drift** no
matter which code path writes. Semantics are identical to the old anti-joins
(verified by `verify-completion-denorm.ts` against a real Postgres — 19 mutation
scenarios).

**If you ever suspect drift** (e.g. someone disabled triggers, or a bulk data fix):

```sql
-- Detect: rows where the denorm boolean disagrees with a fresh recompute.
SELECT count(*) FROM checkpoint_slots s
WHERE s."allActivitiesDone" IS DISTINCT FROM (
  SELECT count(a.id) > 0 AND count(a.id) FILTER (WHERE NOT a."completed") = 0
  FROM checkpoint_activities a WHERE a."slotId" = s.id
);

-- Repair everything bottom-up (idempotent, safe to run anytime):
SELECT nm_reheal_completion_denorm();
```

`verify-completion-denorm.ts` re-runs the full correctness proof against any DB
(guarded by `NM_ALLOW_DESTRUCTIVE=1`; use a throwaway DATABASE_URL).
