-- ===========================================================================
-- Workload-driven index advisor  (run in the Supabase SQL editor / psql)
-- ===========================================================================
-- Turns the one-off DB load audit into a repeatable process: read the real
-- query workload from pg_stat_statements, then ask Postgres itself which
-- indexes would help — using hypothetical (zero-cost, never-built) indexes so
-- nothing is created until you decide.
--
-- Built on the AutoAdmin / CoPhy line of research (what-if index analysis over
-- an observed workload). Supabase ships both extensions used here.
--
-- Run this every few weeks, or after shipping a feature that adds new query
-- shapes. Anything it recommends: sanity-check against the leading-column rule,
-- then add via a migration the same way 20260716000000 did.
-- ===========================================================================

-- 1. One-time setup (safe to re-run).
create extension if not exists hypopg;          -- hypothetical indexes
create extension if not exists index_advisor;   -- Supabase's what-if advisor
create extension if not exists pg_stat_statements;

-- ---------------------------------------------------------------------------
-- 2. The workload: the statements costing the most total time. This is the
--    same list the audit started from — start where the time actually goes.
-- ---------------------------------------------------------------------------
select
  calls,
  round(total_exec_time)          as total_ms,
  round(mean_exec_time::numeric, 2) as mean_ms,
  round(
    100.0 * shared_blks_hit / nullif(shared_blks_hit + shared_blks_read, 0),
    1
  )                               as cache_hit_pct,
  rows,
  query
from pg_stat_statements
where query ilike 'select%'
  and query not ilike '%pg_%'          -- ignore catalog / tooling noise
  and query not ilike '%information_schema%'
order by total_exec_time desc
limit 30;

-- ---------------------------------------------------------------------------
-- 3. Ask the advisor about ONE query. index_advisor() plans the statement with
--    hypothetical indexes and returns the ones that lower its cost.
--
--    IMPORTANT: paste a runnable query with LITERAL values. pg_stat_statements
--    normalizes constants to $1/$2 placeholders, which the planner can't cost —
--    those come back in the `errors` column. Substitute a representative value.
--
--    Example (swap in a real query from step 2):
-- ---------------------------------------------------------------------------
select index_statements, errors
from index_advisor($$
  select id from notifications
  where "userId" = 'some-real-user-id' and read = false
  order by "createdAt" desc
  limit 1
$$);

-- ---------------------------------------------------------------------------
-- 4. Manually test a candidate index without building it (hypopg). Create a
--    hypothetical index, then EXPLAIN the query — if the plan picks it and the
--    cost drops, it's worth a real migration. Nothing is written to disk.
-- ---------------------------------------------------------------------------
-- select * from hypopg_create_index(
--   'create index on notifications ("userId", "createdAt") where read = false'
-- );
-- explain (format text)
--   select id from notifications
--   where "userId" = 'some-real-user-id' and read = false
--   order by "createdAt" desc limit 1;
-- select hypopg_reset();   -- drop all hypothetical indexes when done

-- ---------------------------------------------------------------------------
-- 5. Housekeeping checks worth eyeballing on the same cadence.
-- ---------------------------------------------------------------------------

-- Unused indexes (idx_scan = 0): candidates to drop (write cost with no reads).
select
  s.relname   as table,
  s.indexrelname as index,
  s.idx_scan,
  pg_size_pretty(pg_relation_size(s.indexrelid)) as size
from pg_stat_user_indexes s
join pg_index i on i.indexrelid = s.indexrelid
where s.schemaname = 'public'
  and s.idx_scan = 0
  and not i.indisprimary
  and not i.indisunique          -- unique/PK indexes enforce constraints; keep
order by pg_relation_size(s.indexrelid) desc;

-- Tables doing lots of sequential scans relative to index scans: possible
-- missing index (or a table small enough that a seq scan is correct).
select
  relname as table,
  seq_scan,
  idx_scan,
  n_live_tup as rows,
  pg_size_pretty(pg_total_relation_size(relid)) as size
from pg_stat_user_tables
where schemaname = 'public' and seq_scan > 0
order by seq_scan desc
limit 25;

-- Reset the workload counters after a review so the next window starts clean:
-- select pg_stat_statements_reset();
