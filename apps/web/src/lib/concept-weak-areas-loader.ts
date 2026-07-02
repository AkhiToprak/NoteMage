/**
 * Weakness Training Phase 4.1a — the single `ConceptMastery` fan-out loader
 * (plan `plans/weakness-training-phase4.md` §11.5, §10.2).
 *
 * Every weak-area read surface used to independently run the same
 * `db.conceptMastery.findMany({ where: { userId }, include: { concept: true
 * } })` → flatten-to-`ConceptWeakAreaRow[]` fan-out (verified at all four call
 * sites: `weak-spots/page.tsx`, `weak-spots-debug/page.tsx`,
 * `dashboard-data.ts`, `weakness-session-generator.ts`'s `pickSessionConcepts`
 * — the last is what `api/weakness/sessions/route.ts` calls into). This
 * module is the ONE place that runs it now.
 *
 * Beyond deduping the query, this loader is where cross-path concept merges
 * (§11.1 `Concept.canonicalId`) become visible to mastery: it groups mastery
 * rows by `concept.canonicalId ?? concept.id` and unions each group's
 * evidence at read time (§11.5) — `recordConceptAttempt()` keeps writing
 * per-`conceptId` exactly as before (§10.1 "canonical resolution is
 * read-time, everywhere"), so this is pure post-processing upstream of
 * `deriveConceptWeakAreas()`. With zero merges (every group size 1, which is
 * the ENTIRE fleet until 4.1b's tier-2 embeddings start writing
 * `canonicalId`), the output is byte-identical to the old per-call-site
 * mapping — verified in `concept-weak-areas-loader.test.ts`.
 *
 * `decaySums()` (from `concept-mastery.ts`) is reused UNCHANGED, once per
 * group member, to bring every member's evidence forward to the group's
 * shared recency anchor (`latestAttemptAt`, the max `lastAttemptAt` across
 * the group) before summing — see {@link loadConceptWeakAreaRows}'s doc
 * comment for the exact algorithm. `classifyBand`/`wilsonLcb` are NOT called
 * here; they still run once per (now merged) row inside
 * `deriveConceptWeakAreas()`, unchanged.
 */

import { db } from '@/lib/db';
import { decaySums } from '@/lib/concept-mastery';
import type { ConceptWeakAreaRow } from '@/lib/concept-weak-areas';

// ─── Options ────────────────────────────────────────────────────────────

export interface LoadConceptWeakAreaRowsOptions {
  /**
   * Restrict the underlying `ConceptMastery` query to a subset of
   * `conceptId`s (Prisma `in` filter). Mirrors the narrower query
   * `pickSessionConcepts` used to run itself before this extraction —
   * callers that only need a handful of concepts' rows (rather than the
   * user's entire mastery set) can pass this to avoid loading everything.
   * When omitted, every `ConceptMastery` row for the user is loaded (the
   * behavior every original call site had).
   */
  conceptIds?: string[];
}

/**
 * Weakness Training Phase 4.2b (plan phase4 §11.6, ridden along on this
 * loader per §10.2 "one loader, now five consumers"): {@link ConceptWeakAreaRow}
 * plus one additive field the loader alone can compute (it's the only place
 * that already has every merge-group member's `slotId` in hand). Purely
 * additive — every existing consumer that destructures/spreads a plain
 * `ConceptWeakAreaRow` (e.g. `deriveConceptWeakAreas`'s `concepts` input,
 * which only reads the base fields) is unaffected; only callers that want
 * the "Seen in N places" copy (§11.6) need to look at this field.
 */
export interface ConceptWeakAreaRowWithMergeInfo extends ConceptWeakAreaRow {
  /** Distinct `slotId` count across this merge group's members — 1 for an
   *  unmerged concept (the default state of the fleet pre-4.1b), >1 once a
   *  concept has been merged across multiple slots/paths. */
  mergedSlotCount: number;
}

// ─── Grouping ───────────────────────────────────────────────────────────

/** One `ConceptMastery` row, flattened with just the `concept` fields the
 *  grouping/union logic needs. Shaped to match the Prisma `include` below. */
interface RawMasteryRow {
  conceptId: string;
  weightedCorrect: number;
  weightedTotal: number;
  attemptCount: number;
  lastAttemptAt: Date | null;
  lastCorrectAt: Date | null;
  peakLcb: number;
  status: string;
  concept: {
    id: string;
    canonicalId: string | null;
    label: string;
    mergedLabelSnapshot: string | null;
    planId: string;
    slotId: string;
  };
}

/**
 * Union one merge group's member rows into a single {@link ConceptWeakAreaRow}.
 * `members` is non-empty; `canonicalConceptId` is the group's key
 * (`concept.canonicalId ?? concept.id` for every member, by construction).
 *
 * Algorithm (plan §11.5):
 *  - `latestAttemptAt` = the max `lastAttemptAt` across all members (null if
 *    every member has never been attempted).
 *  - Each member's `(weightedCorrect, weightedTotal)` is decayed FORWARD from
 *    its OWN `lastAttemptAt` to `latestAttemptAt` via the existing
 *    `decaySums()` — this is the same decay math `classifyBand` already
 *    applies from a stored anchor to "now"; here the anchor is the group's
 *    shared recency point instead of `now` (a second, later decay from
 *    `latestAttemptAt` to the caller's `now` still happens inside
 *    `deriveConceptWeakAreas` via `classifyBand`, unchanged).
 *  - Decayed sums are summed across members.
 *  - `attemptCount` sums across members.
 *  - `lastCorrectAt` / `peakLcb` take the max across members (both are
 *    "best ever" signals — a union should never report an evidence peak
 *    lower than any single member reached).
 *  - `label` = the CANONICAL member's `mergedLabelSnapshot ?? label` if the
 *    canonical concept itself has a mastery row in this group; otherwise the
 *    label of the first member (fallback — the canonical concept exists but
 *    this user has never attempted it directly, only merged siblings).
 *  - `planId`/`slotId`/`status` likewise come from the canonical member row
 *    when present, else the first member.
 *  - `mergedSlotCount` (Phase 4.2b, plan §11.6) = the count of DISTINCT
 *    `slotId`s across `members` — "Seen in N places" is a slot count, not a
 *    row count, so two mastery rows that happen to share a `slotId` (can't
 *    happen today since `Concept` is unique per `(slotId, key)`, but this
 *    stays correct if that ever changes) would still read as 1 place.
 */
function unionGroup(canonicalConceptId: string, members: RawMasteryRow[]): ConceptWeakAreaRowWithMergeInfo {
  let latestAttemptAt: Date | null = null;
  for (const m of members) {
    if (m.lastAttemptAt && (!latestAttemptAt || m.lastAttemptAt > latestAttemptAt)) {
      latestAttemptAt = m.lastAttemptAt;
    }
  }

  let weightedCorrect = 0;
  let weightedTotal = 0;
  let attemptCount = 0;
  let lastCorrectAt: Date | null = null;
  let peakLcb = 0;

  for (const m of members) {
    // decaySums no-ops (returns sums unchanged) when fromAt === null, which
    // matches a never-attempted row's 0/0 sums — nothing to decay.
    const decayed = latestAttemptAt
      ? decaySums(
          { weightedCorrect: m.weightedCorrect, weightedTotal: m.weightedTotal },
          m.lastAttemptAt,
          latestAttemptAt
        )
      : { weightedCorrect: m.weightedCorrect, weightedTotal: m.weightedTotal };

    weightedCorrect += decayed.weightedCorrect;
    weightedTotal += decayed.weightedTotal;
    attemptCount += m.attemptCount;
    if (m.lastCorrectAt && (!lastCorrectAt || m.lastCorrectAt > lastCorrectAt)) {
      lastCorrectAt = m.lastCorrectAt;
    }
    peakLcb = Math.max(peakLcb, m.peakLcb);
  }

  // Prefer the canonical row itself (concept.id === group key) for
  // label/planId/slotId/status; fall back to the first member when the
  // canonical concept has no mastery row of its own for this user (e.g. the
  // user only ever attempted a merged sibling, never the canonical concept
  // directly).
  const canonicalMember = members.find((m) => m.concept.id === canonicalConceptId) ?? members[0];
  const mergedSlotCount = new Set(members.map((m) => m.concept.slotId)).size;

  return {
    conceptId: canonicalConceptId,
    label: canonicalMember.concept.mergedLabelSnapshot ?? canonicalMember.concept.label,
    planId: canonicalMember.concept.planId,
    slotId: canonicalMember.concept.slotId,
    status: canonicalMember.status,
    weightedCorrect,
    weightedTotal,
    attemptCount,
    lastAttemptAt: latestAttemptAt,
    lastCorrectAt,
    peakLcb,
    mergedSlotCount,
  };
}

/**
 * Load this user's `ConceptMastery` rows, group by
 * `concept.canonicalId ?? concept.id`, and union each group into one
 * {@link ConceptWeakAreaRow} (§11.5). With zero merges (every group size 1 —
 * the default state of the fleet until 4.1b starts writing `canonicalId`),
 * every group unions trivially to its single member, which is
 * byte-identical to the mapping every call site used to do inline.
 *
 * All five weak-area consumers (§10.2 — the four repointed here, plus 4.4's
 * nudge sweep later) MUST go through this loader rather than querying
 * `ConceptMastery` directly, so a merge is visible everywhere at once.
 */
export async function loadConceptWeakAreaRows(
  userId: string,
  options: LoadConceptWeakAreaRowsOptions = {}
): Promise<ConceptWeakAreaRowWithMergeInfo[]> {
  const masteryRows = await db.conceptMastery.findMany({
    where: {
      userId,
      ...(options.conceptIds ? { conceptId: { in: options.conceptIds } } : {}),
    },
    include: {
      concept: {
        select: {
          id: true,
          canonicalId: true,
          label: true,
          mergedLabelSnapshot: true,
          planId: true,
          slotId: true,
        },
      },
    },
  });

  const groups = new Map<string, RawMasteryRow[]>();
  for (const row of masteryRows) {
    const key = row.concept.canonicalId ?? row.concept.id;
    const bucket = groups.get(key);
    if (bucket) {
      bucket.push(row);
    } else {
      groups.set(key, [row]);
    }
  }

  const result: ConceptWeakAreaRowWithMergeInfo[] = [];
  for (const [canonicalConceptId, members] of groups) {
    result.push(unionGroup(canonicalConceptId, members));
  }
  return result;
}
