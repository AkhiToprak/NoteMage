/**
 * Weakness Training Phase 1A — shared DB write helpers for the concept layer.
 *
 * This module is the single write surface for `Concept` / `ConceptTag` /
 * `ConceptAttemptEvent` / `ConceptMastery` rows. Three call sites share it:
 *   1. Generation-time persistence (Stage A/B tool output → Concept + ConceptTag).
 *   2. The post-commit attempt-tracking hook (`concept-tracking.ts`, this agent).
 *   3. The slot-backfill job handler (sibling agent — classifies already-existing
 *      content that has zero ConceptTag rows yet).
 *
 * Every function here is intentionally side-effect-scoped and idempotent —
 * see each function's docstring for its specific replay-safety guarantee.
 * The pure mastery math lives in `concept-mastery.ts`; this file is the only
 * place that talks to Prisma for these four tables.
 *
 * Canonical source: `plans/weakness-training.md` §2.2 (multi-concept credit),
 * §3 (data model), §3.1 (closed-enum tool-schema contract), §4 (failure-safe
 * detection). See also `plans/weakness-phase0-findings.md` decision: teaching
 * rows aside, mastery writes are plain DB rows — no AI/network calls here.
 */

import { Prisma, type PrismaClient } from '@prisma/client';
import { db } from '@/lib/db';
import {
  applyEvent,
  classifyBand,
  countDistinctCalendarDays,
  isStrugglingStatus,
  resolveGraduationBand,
  TAG_WEIGHT_PRIMARY,
  TAG_WEIGHT_SECONDARY,
  type MasteryBand,
  type MasteryInputs,
} from '@/lib/concept-mastery';
import { tier1Match } from '@/lib/concept-dedup-match';

/** Any Prisma client or interactive-transaction client — every helper below
 *  accepts this so callers can either run standalone (default `db`) or
 *  compose multiple helpers inside one `db.$transaction(async (tx) => …)`. */
type DbClient = PrismaClient | Prisma.TransactionClient;

const MAX_TAGS_PER_ITEM = 2;

// ─── Slug ───────────────────────────────────────────────────────────────

/**
 * Stable slug for a concept label, e.g. "Regular -ar present tense" →
 * "regular-ar-present-tense". Lowercases, strips diacritics, replaces any
 * run of non-alphanumeric characters with a single hyphen, and trims leading/
 * trailing hyphens. Pure — no I/O. Used as `Concept.key` (unique within a
 * slot) and as the canonical map key in {@link persistSlotConcepts}.
 */
export function slugifyConceptKey(label: string): string {
  const normalized = label
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, ''); // strip combining diacritics
  const slug = normalized
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'concept';
}

// ─── Concept upsert (closed-enum candidate persistence) ────────────────────

/** Bound on how many of the user's existing canonical concepts tier-1 dedup
 *  scans for a lexical match (plan §11.2 "bounded... 500 most-recently-created
 *  unmerged concepts" — reused here as the same cap for the synchronous
 *  tier-1 candidate pool, most-recent first). */
const TIER1_CANDIDATE_POOL_CAP = 500;

/** Resolved tier-1 match: the canonical id to point the new row at, plus the
 *  matched candidate's OWN label — frozen onto the new row's
 *  `mergedLabelSnapshot` (§11.1: "canonical row's label frozen at merge
 *  time"), never the new row's own label. */
interface Tier1MatchResult {
  canonicalId: string;
  label: string;
}

/**
 * Tier-1 lexical dedup (plan §11.2, §11.4): before creating a brand-new
 * canonical `Concept` row, check the user's OTHER existing canonical
 * concepts (`canonicalId: null`, across all their plans) for an exact-slug
 * or Jaccard-token-overlap match via {@link tier1Match}. Best-effort — any
 * failure here (e.g. a transient DB error on the extra lookup) must never
 * block concept persistence, so this returns `null` (no match) on error
 * rather than throwing, consistent with this file's failure-safe discipline
 * (see file header).
 *
 * Scoped by resolving `userId` from `planId` first (concepts don't carry
 * `userId` directly — only their owning `StudyPlan` does).
 */
async function findTier1Match(
  planId: string,
  newLabel: string,
  newKey: string,
  client: DbClient
): Promise<Tier1MatchResult | null> {
  try {
    const plan = await client.studyPlan.findUnique({
      where: { id: planId },
      select: { userId: true },
    });
    if (!plan) return null;

    const candidates = await client.concept.findMany({
      where: { canonicalId: null, plan: { userId: plan.userId } },
      select: { id: true, key: true, label: true, canonicalId: true },
      orderBy: { createdAt: 'desc' },
      take: TIER1_CANDIDATE_POOL_CAP,
    });
    if (candidates.length === 0) return null;

    const matchedId = tier1Match(newLabel, newKey, candidates);
    if (!matchedId) return null;

    // tier1Match resolves through canonicalId ?? id already, so matchedId IS
    // the true canonical id — but the label we want to snapshot is the
    // MATCHED CANDIDATE's own label (the row that actually cleared the bar),
    // which is always a member of `candidates` (never a further-chained
    // ancestor beyond what's in this pool) since candidates are themselves
    // filtered to `canonicalId: null` (i.e. already canonical).
    const matchedCandidate = candidates.find((c) => (c.canonicalId ?? c.id) === matchedId);
    return { canonicalId: matchedId, label: matchedCandidate?.label ?? newLabel };
  } catch (error) {
    console.error('[persistSlotConcepts] tier-1 dedup lookup failed (non-fatal)', {
      planId,
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Upsert one `Concept` row per candidate label for a slot, keyed by
 * `slugifyConceptKey(label)` (unique within `slotId` via `@@unique([slotId,
 * key])`). Idempotent: an existing `(slotId, key)` row is left untouched
 * (not overwritten) and its id is reused — safe to call repeatedly for the
 * same slot (e.g. on a generation retry or a backfill re-run).
 *
 * Returns a Map keyed by BOTH the slug and the verbatim candidate label →
 * `conceptId`, so callers ({@link attachConceptTags} and its callers) can
 * match a model-emitted `conceptKey` whether the model echoed the slug or
 * the original label text.
 *
 * Phase 4.1a (plan §11.2 tier 1): when a candidate label doesn't already
 * exist in THIS slot (i.e. the upsert is about to `create`, not reuse an
 * existing row), first check whether it lexically matches one of the user's
 * existing canonical concepts from OTHER slots/plans via
 * {@link findTier1Match}. On a hit, the brand-new row is created already
 * pointing at that match (`canonicalId`/`mergedAt`/`mergedLabelSnapshot`) —
 * never on an existing row, so tier-1 never touches written history (§11.1).
 * A miss creates a genuinely new canonical concept (`canonicalId: null`),
 * exactly as before this change.
 *
 * @param planId Owning `StudyPlan.id` (required FK on `Concept`).
 * @param slotId Owning `CheckpointSlot.id` — the closed-enum scope.
 * @param candidateLabels The 2-4 short skill labels emitted by Stage A's
 *   `conceptCandidates` for this slot.
 * @param client Optional Prisma client/tx — defaults to the shared `db`.
 */
export async function persistSlotConcepts(
  planId: string,
  slotId: string,
  candidateLabels: string[],
  client: DbClient = db
): Promise<Map<string, string>> {
  const byKey = new Map<string, string>();
  const seenKeys = new Set<string>();

  for (const rawLabel of candidateLabels) {
    const label = rawLabel.trim();
    if (!label) continue;
    const key = slugifyConceptKey(label);
    if (seenKeys.has(key)) continue; // de-dupe within this call's input
    seenKeys.add(key);

    const alreadyExists = await client.concept.findUnique({
      where: { slotId_key: { slotId, key } },
      select: { id: true },
    });

    // Only a genuinely NEW row needs a tier-1 lookup — an existing
    // (slotId, key) row is reused untouched below, same as before.
    const tier1 = alreadyExists ? null : await findTier1Match(planId, label, key, client);

    const concept = await client.concept.upsert({
      where: { slotId_key: { slotId, key } },
      update: {}, // idempotent — never overwrite an existing concept's label/description
      create: tier1
        ? {
            planId,
            slotId,
            key,
            label,
            canonicalId: tier1.canonicalId,
            mergedAt: new Date(),
            mergedLabelSnapshot: tier1.label,
          }
        : {
            planId,
            slotId,
            key,
            label,
          },
    });

    byKey.set(key, concept.id);
    byKey.set(label, concept.id);
  }

  return byKey;
}

// ─── Concept tagging (closed-enum enforcement) ──────────────────────────

/**
 * Attach up to {@link MAX_TAGS_PER_ITEM} `ConceptTag` rows to an item.
 * CLOSED-ENUM enforcement (plan §3.1 / Phase 0 finding B2): any `conceptKey`
 * not present in `conceptIdByKey` is silently dropped — fail-closed, never
 * creates a new `Concept` row. The first surviving key is the primary tag
 * (`weight = TAG_WEIGHT_PRIMARY`), the second is secondary
 * (`weight = TAG_WEIGHT_SECONDARY`); anything beyond the 2nd surviving key is
 * dropped too (cap, not just a slice of the input — i.e. capping happens
 * AFTER the closed-enum filter, so 3 candidate keys where the 1st is off-enum
 * still yields 2 tags from the 2nd/3rd).
 *
 * Idempotent: upserts on the `@@unique([conceptId, itemType, itemId])`
 * constraint, so re-tagging the same item (e.g. a generation retry) updates
 * the weight in place rather than duplicating rows. Does NOT delete tags for
 * keys no longer present in this call — callers that need full replace
 * semantics should delete first.
 */
export async function attachConceptTags(
  itemType: 'quiz_question' | 'flashcard',
  itemId: string,
  conceptKeys: string[],
  conceptIdByKey: Map<string, string>,
  client: DbClient = db
): Promise<void> {
  const resolvedConceptIds: string[] = [];
  const seen = new Set<string>();

  for (const rawKey of conceptKeys) {
    if (resolvedConceptIds.length >= MAX_TAGS_PER_ITEM) break;
    const conceptId = conceptIdByKey.get(rawKey) ?? conceptIdByKey.get(rawKey.trim());
    if (!conceptId) continue; // off-enum — fail closed, drop silently
    if (seen.has(conceptId)) continue; // de-dupe (label + slug can both map to same id)
    seen.add(conceptId);
    resolvedConceptIds.push(conceptId);
  }

  for (let i = 0; i < resolvedConceptIds.length; i++) {
    const conceptId = resolvedConceptIds[i];
    const weight = i === 0 ? TAG_WEIGHT_PRIMARY : TAG_WEIGHT_SECONDARY;
    await client.conceptTag.upsert({
      where: { conceptId_itemType_itemId: { conceptId, itemType, itemId } },
      update: { weight },
      create: { conceptId, itemType, itemId, weight },
    });
  }
}

// ─── Attempt-event recording + mastery upsert ───────────────────────────

export interface RecordConceptAttemptParams {
  conceptId: string;
  userId: string;
  itemType: 'quiz_question' | 'flashcard';
  itemId: string;
  /** `QuizAttempt.id` (or future `AssessmentAttempt.id`) — dedupe + audit key. */
  sourceAttemptId: string;
  /** `QuestionKind` value — passed through to `AttemptEvent.kind` for the
   *  chanceP lookup, and persisted verbatim on `ConceptAttemptEvent.questionKind`. */
  questionKind: string;
  isCorrect: boolean;
  usedHint: boolean;
  attemptNumber: number;
  /** 1.0 primary concept, 0.5 secondary concept (§2.2) — from the `ConceptTag.weight`. */
  tagWeight: number;
  /** Only meaningful for `kind === 'mc'`. */
  numOptions?: number;
  eventAt: Date;
  /** Signal-source trust discount (plan §13.2) — defaults to
   *  `SOURCE_WEIGHT_GRADED` (1.0) when omitted, threaded straight through to
   *  `applyEvent`'s `AttemptEvent.sourceWeight`. Not persisted as its own
   *  column (§13.2 folds it into the mastery math only); `origin` below is
   *  the persisted audit trail for which pipeline produced the event. */
  sourceWeight?: number;
  /** Which pipeline produced this event (plan §10.3) — `'general'` (default,
   *  ordinary quiz grading), `'weakness_session'` (a remediation re-test —
   *  feeds the Phase 4.4 retest-failure-streak nudge trigger), or
   *  `'flashcard_review'` (a self-graded flashcard — explicitly EXCLUDED
   *  from that trigger, since a self-graded "Again" is not a failed
   *  retest). Persisted verbatim on `ConceptAttemptEvent.origin`. */
  origin?: 'general' | 'weakness_session' | 'flashcard_review';
}

function qualityScoreFor(isCorrect: boolean, usedHint: boolean, attemptNumber: number): 0 | 1 | 2 {
  if (!isCorrect) return 0;
  return !usedHint && attemptNumber <= 1 ? 2 : 1;
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/**
 * Result of a (non-replay) {@link recordConceptAttempt} call.
 *
 * `band` is the FINAL persisted band — i.e. `classifyBand`'s result after
 * the §2.4 graduation override ({@link resolveGraduationBand}) has been
 * applied, never the raw pre-override band. `prevStatus` is the
 * `ConceptMastery.status` this concept had BEFORE this event (`null` if
 * there was no prior row) — callers use the `(prevStatus, band)` pair to
 * detect band transitions (e.g. the Phase 3 misconception-enqueue trigger
 * in `concept-tracking.ts`, which fires on `prevStatus !== 'weak' && band
 * === 'weak'`).
 */
export interface RecordConceptAttemptResult {
  band: MasteryBand;
  prevStatus: string | null;
}

/**
 * Record one concept-attempt event and roll it into that user's
 * `ConceptMastery` row. Returns a {@link RecordConceptAttemptResult}, or
 * `null` if the event was a replay (already recorded) — in which case
 * mastery is NOT touched, keeping replays a true no-op rather than
 * double-counting.
 *
 * Steps:
 *  1. Insert `ConceptAttemptEvent` idempotently — relies on the DB's
 *     `@@unique([sourceAttemptId, conceptId, itemId])` guard. A unique-
 *     violation here means this exact event was already recorded (retry /
 *     replay of the same grading call), so we return `null` immediately
 *     without reading or writing `ConceptMastery`. `createdAt` is set
 *     explicitly to `eventAt` (overriding the column's `@default(now())`)
 *     so the row's timestamp is the EVENT time, not the insert time — for
 *     live grading (`concept-tracking.ts` passes `eventAt: now`) this is a
 *     no-op, but for replayed/backfilled events (`concept-backfill.ts`
 *     passes historical `answer.createdAt`) it keeps the row historically
 *     faithful. Without this, backfilled events all land on today's date,
 *     which can deflate the §2.4 distinct-correct-days window (blocking a
 *     legitimate graduation) or — if a backfill run's sequential inserts
 *     straddle UTC midnight — fabricate a spurious 2nd calendar day and let
 *     a concept graduate to `solid` with zero real recovery time.
 *  2. Read the existing `ConceptMastery` row for `(userId, conceptId)`,
 *     defaulting to zeroed `MasteryInputs` if none exists yet. Its raw
 *     `status` (or `null` if no row existed) is `storedStatus` — this is
 *     what gets RETURNED as `prevStatus` in the result (contract consumed by
 *     `concept-tracking.ts`'s `result.prevStatus !== 'weak'` check; never
 *     repoint this to the re-derived value from step 2.5).
 *  2.5. Second-order-defect fix: `storedStatus` is a write-time cache that
 *     can go stale between attempts (§2.1.1) — e.g. genuinely `'solid'` but
 *     dormant 60+ days, so it would re-decay to `'rusty'` right now. Compute
 *     `rederivedBand = classifyBand(prev, eventAt)` (pre-event sums) and use
 *     `gatePrevStatus` — struggling if EITHER `storedStatus` OR
 *     `rederivedBand` is struggling — as the `prevStatus` fed into the
 *     graduation gate ONLY (step 5), never as the returned `prevStatus`.
 *  3. `applyEvent(prev, event, eventAt)` — pure decay-then-accrue (see
 *     `concept-mastery.ts`).
 *  4. `status = classifyBand(next, eventAt)` (write-time cache, §2.1.1).
 *  5. §2.4 graduation gate: find the most recent INCORRECT event for this
 *     user+concept, then load correct-event dates strictly AFTER it (or all
 *     of them if there is no prior incorrect event — includes the event
 *     just inserted in step 1, since it uses the same `client`), count
 *     distinct UTC calendar days (`countDistinctCalendarDays`), then
 *     `resolveGraduationBand(status, gatePrevStatus, distinctCorrectDays)` —
 *     a concept climbing out of weak/strengthening/rusty only reads `solid`
 *     once it has a correct re-test (since the last failure) on >=2 distinct
 *     calendar days; otherwise it reads `strengthening`. Bounding the window
 *     to "since the last incorrect answer" also closes the "fail on
 *     purpose, then pass twice same-day" gaming hole. This gated band
 *     (`gradBand`) is what gets persisted and returned, not the raw `status`.
 *     Both queries are covered by the existing
 *     `@@index([userId, conceptId, createdAt])` on `ConceptAttemptEvent`.
 *  6. Upsert `ConceptMastery` with the new sums/counts/dates/`peakLcb`/
 *     `gradBand`.
 *
 * Runs as one `client.$transaction` when called with the default `db`
 * client (no surrounding transaction) so steps 2-6 are atomic against
 * concurrent attempts on the same concept; when called with an already-open
 * `tx` client, the caller's transaction covers it instead (no nested
 * transaction is started).
 */
export async function recordConceptAttempt(
  params: RecordConceptAttemptParams,
  client: DbClient = db
): Promise<RecordConceptAttemptResult | null> {
  const {
    conceptId,
    userId,
    itemType,
    itemId,
    sourceAttemptId,
    questionKind,
    isCorrect,
    usedHint,
    attemptNumber,
    tagWeight,
    numOptions,
    eventAt,
    sourceWeight,
    origin,
  } = params;

  const quality = qualityScoreFor(isCorrect, usedHint, attemptNumber);

  try {
    await client.conceptAttemptEvent.create({
      data: {
        conceptId,
        userId,
        itemType,
        itemId,
        sourceAttemptId,
        questionKind,
        quality,
        isCorrect,
        createdAt: eventAt,
        origin: origin ?? 'general',
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      // Already recorded — replay-safe no-op, mastery untouched.
      return null;
    }
    throw error;
  }

  const runUpdate = async (tx: DbClient): Promise<RecordConceptAttemptResult> => {
    const existing = await tx.conceptMastery.findUnique({
      where: { userId_conceptId: { userId, conceptId } },
    });
    // RAW stored cache — never re-derived. This is what gets RETURNED as
    // `RecordConceptAttemptResult.prevStatus`; `concept-tracking.ts` gates
    // its misconception-transition signal on `result.prevStatus !== 'weak'`,
    // so that contract must see the actual prior write, not any
    // gate-internal re-derivation below. Do not repoint this.
    const storedStatus = existing?.status ?? null;

    const prev: MasteryInputs = existing
      ? {
          weightedCorrect: existing.weightedCorrect,
          weightedTotal: existing.weightedTotal,
          attemptCount: existing.attemptCount,
          lastAttemptAt: existing.lastAttemptAt,
          lastCorrectAt: existing.lastCorrectAt,
          peakLcb: existing.peakLcb,
        }
      : {
          weightedCorrect: 0,
          weightedTotal: 0,
          attemptCount: 0,
          lastAttemptAt: null,
          lastCorrectAt: null,
          peakLcb: 0,
        };

    // Second-order-defect fix (confirmed bypass): `storedStatus` is a
    // write-time cache that can go stale between attempts (§2.1.1) — e.g. a
    // genuinely `'solid'` concept dormant 60+ days still reads `'solid'` in
    // the DB even though re-decaying it right now would say `'rusty'`. If we
    // fed that stale `storedStatus` straight into `resolveGraduationBand`,
    // its `wasStruggling` check would miss the struggling state entirely and
    // let a same-day burst of correct answers graduate ungated. Re-derive
    // the band the stored sums would classify as RIGHT NOW (before this
    // event's decay+accrue, using the same `prev`/`eventAt` classifyBand
    // would use) and treat the gate as "struggling" if EITHER the raw stored
    // status OR this re-derived band is struggling.
    const rederivedBand = existing ? classifyBand(prev, eventAt) : null;
    const gatePrevStatus = isStrugglingStatus(storedStatus)
      ? storedStatus
      : isStrugglingStatus(rederivedBand)
        ? rederivedBand
        : storedStatus;

    const next = applyEvent(
      prev,
      { kind: questionKind, isCorrect, usedHint, attemptNumber, tagWeight, numOptions, sourceWeight },
      eventAt
    );
    const status = classifyBand(next, eventAt);

    // §2.4 graduation gate — bounded to the window AFTER the most recent
    // incorrect answer, not all-time. Rationale: graduation is about the
    // RE-test following a failure; correct days that predate the most
    // recent wrong answer aren't confirmation of recovery from THAT failure,
    // and bounding the window also closes the "answer wrong on purpose, then
    // answer correctly twice same-day" gaming hole — a deliberate wrong
    // answer resets the window, so old unrelated correct days can no longer
    // satisfy the distinct-day gate.
    //
    // Both queries are covered by the existing
    // `@@index([userId, conceptId, createdAt])` on ConceptAttemptEvent
    // (prisma/schema.prisma) — no new index needed.
    const lastIncorrect = await tx.conceptAttemptEvent.findFirst({
      where: { userId, conceptId, isCorrect: false },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    // This query sees the event inserted in step 1 above (same `client`/
    // `tx`), so a correct (or incorrect) answer just recorded this call
    // already counts toward `distinctCorrectDays` / the `lastIncorrect` cutoff.
    const correctEvents = await tx.conceptAttemptEvent.findMany({
      where: {
        userId,
        conceptId,
        isCorrect: true,
        ...(lastIncorrect ? { createdAt: { gt: lastIncorrect.createdAt } } : {}),
      },
      select: { createdAt: true },
      take: 500,
    });
    const distinctCorrectDays = countDistinctCalendarDays(
      correctEvents.map((row) => row.createdAt)
    );
    // Accepted behavior (documented, not a defect): a once-`solid` concept
    // gone `rusty` with a CLEAN history (zero incorrect events ever) has no
    // `lastIncorrect` cutoff, so its full multi-day historical correct
    // evidence satisfies the gate and it may re-confirm to `solid` in one
    // sitting — §2.4's graduation clause is scoped to weak/strengthening
    // recovery, not rusty-with-clean-history. Any incorrect answer during
    // the comeback immediately flips it to genuinely weak/strengthening and
    // the full 2-distinct-day gate applies from then on.
    const gradBand = resolveGraduationBand(status, gatePrevStatus, distinctCorrectDays);

    await tx.conceptMastery.upsert({
      where: { userId_conceptId: { userId, conceptId } },
      update: {
        weightedCorrect: next.weightedCorrect,
        weightedTotal: next.weightedTotal,
        attemptCount: next.attemptCount,
        lastAttemptAt: next.lastAttemptAt,
        lastCorrectAt: next.lastCorrectAt,
        peakLcb: next.peakLcb,
        status: gradBand,
      },
      create: {
        userId,
        conceptId,
        weightedCorrect: next.weightedCorrect,
        weightedTotal: next.weightedTotal,
        attemptCount: next.attemptCount,
        lastAttemptAt: next.lastAttemptAt,
        lastCorrectAt: next.lastCorrectAt,
        peakLcb: next.peakLcb,
        status: gradBand,
      },
    });

    // RETURNED prevStatus is the RAW storedStatus, not gatePrevStatus — see
    // the comment above where storedStatus is declared.
    return { band: gradBand, prevStatus: storedStatus };
  };

  // Only open a new transaction when running against the top-level client —
  // an already-open `tx` (passed in by a caller composing multiple concepts
  // in one transaction) must not be nested.
  if (client === db) {
    return db.$transaction((tx) => runUpdate(tx));
  }
  return runUpdate(client);
}
