/**
 * Weakness Training Phase 1A (+ Phase 3 graduation) — concept-level mastery
 * math.
 *
 * PURE module: no Prisma, no DB, no network, no `Date.now()` baked into any
 * function — every helper takes `now`/`eventAt` explicitly so it is
 * deterministic and trivially unit-testable. The DB wiring (Concept,
 * ConceptAttemptEvent, ConceptMastery persistence) is a separate layer; this
 * file only produces the formulas + types it writes and reads.
 *
 * Canonical source: `plans/weakness-training.md` §2.1 "Mastery model",
 * §2.1.1 "status is a cache; reads must re-decay", §2.2 "Multi-concept
 * credit assignment", §2.4 "Graduation & re-decay". The formulas below are
 * the contract — do not retune inline; retune the named `const` exports.
 *
 * ─── Model summary ──────────────────────────────────────────────────────
 *
 * Each concept-attempt event contributes evidence, not a binary score:
 *
 *   chanceP            — how guessable the question format is (§ below)
 *   evidenceWeight      = 1 - chanceP            (T/F=0.5, MC=0.75, free-input=1.0)
 *   qualityMultiplier   = correct & no hint & first try → 1.0
 *                         correct & (hint OR retry)     → 0.6
 *                         incorrect                      → eventCorrect is 0 regardless
 *   tagWeight           = 1.0 primary concept, 0.5 secondary concept (§2.2)
 *   sourceWeight        = 1.0 graded quiz (default), 0.35 flashcard self-grade (§13.2,
 *                         Phase 4.3) — signal-source trust, orthogonal to chanceP/qualityMultiplier
 *   eventCorrect        = isCorrect ? evidenceWeight * qualityMultiplier * tagWeight * sourceWeight : 0
 *   eventTotal          = evidenceWeight * tagWeight * sourceWeight
 *
 * Stored running sums decay (14-day half-life) BEFORE the new event is added:
 *
 *   decayFactor      = 0.5 ^ (daysSinceLastUpdate / 14)
 *   weightedCorrect  = weightedCorrect_prev * decayFactor + eventCorrect
 *   weightedTotal    = weightedTotal_prev   * decayFactor + eventTotal
 *
 * `masteryScore` (0-100 display number, Beta(1,1) prior, reports 50 at zero
 * data) and `wilsonLcb` (the actual weak-flag gate — a conservative lower
 * confidence bound, NOT the raw mean) both read off the (re-decayed) sums.
 *
 * `ConceptMastery.status` in the DB is a denormalised WRITE-TIME CACHE for
 * cheap indexed filtering only (§2.1.1). Decay advances with wall-clock time
 * between writes, so a stored band goes stale — callers MUST re-decay the
 * stored sums to `now` before trusting any band for display. `classifyBand`
 * is the single function that does this; both the write path (to refresh the
 * cache) and every read path (`deriveConceptWeakAreas` et al.) must call it
 * rather than trusting `MasteryInputs.status` directly.
 */

// ─── Tunable constants (plan §9 Q#6 — retune here, not inline) ─────────────

/** Wilson lower-confidence-bound z-score. Deliberately conservative (z=1.0,
 *  not the usual 1.96) — "don't call it mastered on 2 lucky guesses." */
export const WILSON_Z = 1.0;

/** Below this re-decayed `weightedTotal`, there isn't enough evidence to
 *  flag a concept either way — it reads as `untested`, never `weak`. */
export const UNTESTED_BELOW_TOTAL = 2.5;

/** lcb below this (with enough evidence) → `weak`. */
export const WEAK_BELOW_LCB = 0.55;

/** lcb at/above this → `solid` (no action surfaced). Between `WEAK_BELOW_LCB`
 *  and this is `building`. */
export const SOLID_AT_OR_ABOVE_LCB = 0.75;

/** Recency-decay half-life, in days, applied to both weighted sums. */
export const DECAY_HALF_LIFE_DAYS = 14;

/** A previously-solid concept (`peakLcb >= SOLID_AT_OR_ABOVE_LCB`) with no
 *  attempt in this many days is eligible to read as `rusty` instead of
 *  `building`/`weak`. */
export const RUSTY_AFTER_DAYS = 21;

/** Re-decayed lcb must drop below this (in addition to `RUSTY_AFTER_DAYS`
 *  staleness) for a previously-solid concept to read as `rusty`. */
export const RUSTY_BELOW_LCB = 0.65;

/** §2.4 graduation gate: a concept graduating OUT OF a struggling band
 *  (weak/strengthening/rusty) needs a correct re-test on this many DISTINCT
 *  UTC calendar days before it is allowed to read `solid` — one confirming
 *  day reads `strengthening` instead. Closes the "guess twice in one
 *  sitting" gaming hole. See {@link resolveGraduationBand}. */
export const GRADUATION_MIN_CORRECT_DAYS = 2;

/** correct, no hint, first try. */
export const QUALITY_FULL_CREDIT_MULTIPLIER = 1.0;
/** correct, but used a hint OR was not the first attempt — partial credit:
 *  discounts `eventCorrect`, never `eventTotal` (the evidence still counts,
 *  it just reads as less confident). */
export const QUALITY_PARTIAL_CREDIT_MULTIPLIER = 0.6;

/** Primary concept tag weight (§2.2). */
export const TAG_WEIGHT_PRIMARY = 1.0;
/** Secondary concept tag weight — co-tagged concepts get half credit/blame. */
export const TAG_WEIGHT_SECONDARY = 0.5;

/**
 * `sourceWeight` (Phase 4.3, plan §13.2) — a THIRD, orthogonal discount axis
 * alongside `chanceP`/`evidenceWeight` (format-guessability: how much a
 * given question KIND can be guessed) and `qualityMultiplier` (a WITHIN-
 * attempt property: did this particular answer use a hint or a retry).
 * `sourceWeight` is about SIGNAL-SOURCE TRUST: how much to trust the grading
 * mechanism itself, independent of format or attempt quality. Graded quiz
 * answers (server-verified correctness) are full trust; a flashcard
 * self-grade (the learner reporting their own "did I know this") is weaker
 * evidence — same discount idea as `tagWeight`, just on a different axis, so
 * it multiplies in alongside `tagWeight` rather than being folded into
 * either existing axis. Default 1.0 everywhere it isn't explicitly set —
 * omitting it is byte-for-byte identical to today's behavior. */
export const SOURCE_WEIGHT_GRADED = 1.0;
/** Flashcard self-grade discount (plan §13.2's worked example: 5 "Good"
 *  self-grades alone accrue `weightedTotal = 1.75`, still under the 2.5
 *  confidence gate — self-report nudges confidence but never certifies
 *  mastery on its own). Reasoned-not-backtested starting constant (plan §16
 *  Q#8) — retune here, not inline, if beta data says otherwise. */
export const SOURCE_WEIGHT_FLASHCARD_SELF_GRADE = 0.35;

// ─── Types ──────────────────────────────────────────────────────────────

/**
 * 0 = incorrect. 1 = correct but partial credit (used a hint, or not the
 * first attempt). 2 = correct, full credit (no hint, first try).
 * Maps to {@link qualityMultiplier}.
 */
export type QualityScore = 0 | 1 | 2;

/**
 * The authoritative band for a concept, computed at READ TIME by
 * {@link classifyBand} from re-decayed sums. Mirrors `ConceptMastery.status`
 * in the DB (a write-time cache of the same value), but the read path must
 * never trust the stored string for display — see file header / §2.1.1.
 */
export type MasteryBand =
  | 'untested'
  | 'weak'
  | 'building'
  | 'solid'
  | 'strengthening'
  | 'rusty';

/**
 * The stored row shape — exactly the fields persisted on `ConceptMastery`
 * that the pure math needs. `status` and `attemptCount` ride along for
 * write-path bookkeeping but are not required by the band math itself
 * (`classifyBand` ignores `status`/`attemptCount` on purpose — see header).
 */
export interface MasteryInputs {
  weightedCorrect: number;
  weightedTotal: number;
  attemptCount: number;
  lastAttemptAt: Date | null;
  lastCorrectAt: Date | null;
  /** Persisted historical high-water mark — see {@link nextPeakLcb}. Never
   *  re-derived from the decayed sums, which have already forgotten it. */
  peakLcb: number;
}

/**
 * One graded attempt against a single concept tag, already resolved to a
 * single (item, concept) pair — multi-concept items produce one `AttemptEvent`
 * per tagged concept, each carrying that concept's own `tagWeight` (§2.2).
 */
export interface AttemptEvent {
  /** `QuestionKind` value (or any string — unknown kinds default to
   *  `chanceP=0`, i.e. treated as free-input / full evidence). */
  kind: string;
  isCorrect: boolean;
  usedHint: boolean;
  /** 1 = first try. Anything >= 2 is a retry (partial credit if correct). */
  attemptNumber: number;
  /** 1.0 primary concept, 0.5 secondary concept (§2.2). */
  tagWeight: number;
  /** Only meaningful for `kind === 'mc'`; defaults `chancePForKind` to 0.25
   *  4-option MC when omitted. */
  numOptions?: number;
  /** Signal-source trust discount (§13.2 / see {@link SOURCE_WEIGHT_GRADED}
   *  doc comment for the axis explanation). Defaults to 1.0 (graded-quiz
   *  trust) when omitted — every existing caller that doesn't pass this is
   *  byte-for-byte unaffected. */
  sourceWeight?: number;
}

/** Output of {@link computeEventDelta} — the two deltas added to the running
 *  sums (after decay) by {@link applyEvent}. */
export interface EventDelta {
  eventCorrect: number;
  eventTotal: number;
}

// ─── Chance probability / evidence weight ──────────────────────────────────

/**
 * P(correct by pure guessing) for a question kind. Per plan §2.1:
 * mc(4-opt)=0.25, true_false=0.5, match_pairs≈0.2, fill_blank / equation /
 * code_write / translation / code_output ≈ 0. Unknown kinds default to 0
 * (treated as free-input — full evidence, no chance discount).
 */
export function chancePForKind(kind: string, numOptions?: number): number {
  switch (kind) {
    case 'mc':
      return numOptions && numOptions > 0 ? 1 / numOptions : 0.25;
    case 'true_false':
      return 0.5;
    case 'match_pairs':
      return 0.2;
    case 'fill_blank':
    case 'equation':
    case 'code_write':
    case 'translation':
    case 'code_output':
    case 'word_bank':
    case 'sentence_reorder':
    case 'timeline':
    case 'diagram_cloze':
      return 0;
    default:
      // Unknown kind → default chanceP=0 (free-input / full evidence), per
      // task spec: "default unknown kinds to chanceP=0".
      return 0;
  }
}

/** `1 - chanceP` — how much evidence a single event of this kind carries. */
export function evidenceWeightForKind(kind: string, numOptions?: number): number {
  return 1 - chancePForKind(kind, numOptions);
}

/**
 * Credit multiplier on `eventCorrect` for a correct answer. Incorrect
 * answers never reach this — `computeEventDelta` short-circuits
 * `eventCorrect` to 0 for `isCorrect === false` regardless of quality.
 */
export function qualityMultiplier(usedHint: boolean, attemptNumber: number): number {
  const firstTryNoHint = !usedHint && attemptNumber <= 1;
  return firstTryNoHint ? QUALITY_FULL_CREDIT_MULTIPLIER : QUALITY_PARTIAL_CREDIT_MULTIPLIER;
}

/** Map a raw `(isCorrect, usedHint, attemptNumber)` triple to the 0|1|2
 *  {@link QualityScore} used in `ConceptAttemptEvent.quality`. */
export function qualityScoreFor(
  isCorrect: boolean,
  usedHint: boolean,
  attemptNumber: number
): QualityScore {
  if (!isCorrect) return 0;
  return !usedHint && attemptNumber <= 1 ? 2 : 1;
}

/**
 * The two deltas (`eventCorrect`, `eventTotal`) a single attempt event
 * contributes, BEFORE decay is applied to the running sums. Pure function of
 * the event — see file header for the formula.
 */
export function computeEventDelta(event: AttemptEvent): EventDelta {
  const evidenceWeight = evidenceWeightForKind(event.kind, event.numOptions);
  const tagWeight = event.tagWeight;
  const sourceWeight = event.sourceWeight ?? SOURCE_WEIGHT_GRADED;
  const eventTotal = evidenceWeight * tagWeight * sourceWeight;
  const eventCorrect = event.isCorrect
    ? evidenceWeight * qualityMultiplier(event.usedHint, event.attemptNumber) * tagWeight * sourceWeight
    : 0;
  return { eventCorrect, eventTotal };
}

// ─── Decay ──────────────────────────────────────────────────────────────

/**
 * Re-decay the two running sums from `fromAt` to `toAt` using the 14-day
 * half-life. `fromAt === null` (no prior attempt) means there is nothing to
 * decay — returns the sums unchanged (they should be 0/0 in that case).
 * Pure; used identically by the write path (decay-then-accrue) and every
 * read path (decay-then-band, §2.1.1).
 */
export function decaySums(
  sums: { weightedCorrect: number; weightedTotal: number },
  fromAt: Date | null,
  toAt: Date
): { weightedCorrect: number; weightedTotal: number } {
  if (fromAt === null) return { weightedCorrect: sums.weightedCorrect, weightedTotal: sums.weightedTotal };
  const daysSince = Math.max(0, (toAt.getTime() - fromAt.getTime()) / (1000 * 60 * 60 * 24));
  const decayFactor = Math.pow(0.5, daysSince / DECAY_HALF_LIFE_DAYS);
  return {
    weightedCorrect: sums.weightedCorrect * decayFactor,
    weightedTotal: sums.weightedTotal * decayFactor,
  };
}

// ─── Wilson lower confidence bound + display score ─────────────────────────

/**
 * Wilson score LOWER bound at the given z (default {@link WILSON_Z}) on
 * `weightedCorrect/weightedTotal` treated as a Bernoulli rate with
 * `n = weightedTotal`. This is the actual weak-flag gate, not the raw mean —
 * it pulls thin evidence toward 0 conservatively. Guards `n=0` → 0.
 */
export function wilsonLcb(weightedCorrect: number, weightedTotal: number, z: number = WILSON_Z): number {
  const n = weightedTotal;
  if (!(n > 0)) return 0;
  const pHat = weightedCorrect / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = pHat + z2 / (2 * n);
  const margin = z * Math.sqrt(pHat * (1 - pHat) / n + z2 / (4 * n * n));
  const lcb = (center - margin) / denom;
  // Numerical safety: clamp into [0, 1] in case of floating-point overshoot
  // at the pHat=0 / pHat=1 extremes.
  return Math.min(1, Math.max(0, lcb));
}

/**
 * 0-100 display mastery score, Beta(1,1) prior — reports 50 at zero data
 * (`weightedTotal === 0`) rather than 0. Display only; the weak-flag
 * decision is {@link wilsonLcb}, not this.
 */
export function masteryScore(weightedCorrect: number, weightedTotal: number): number {
  return (100 * (1 + weightedCorrect)) / (2 + weightedTotal);
}

// ─── peakLcb (persisted history) ────────────────────────────────────────

/**
 * `peakLcb` is PERSISTED historical state (§2.1.1) — the highest lcb a
 * concept ever reached. It is never re-derived from the current decayed
 * sums (which have already forgotten the peak by the time decay erodes
 * them); the write path calls this after computing the post-event lcb and
 * persists the result.
 */
export function nextPeakLcb(prevPeak: number, newLcb: number): number {
  return Math.max(prevPeak, newLcb);
}

// ─── Write path: apply one event ───────────────────────────────────────

/**
 * Decay `prev`'s sums to `eventAt`, accrue the new event's delta, bump
 * bookkeeping fields, and roll `peakLcb` forward using the POST-event lcb.
 * Pure — the caller (DB layer) is responsible for loading `prev`,
 * persisting the result, and any idempotency/dedupe guard
 * (`ConceptAttemptEvent.sourceAttemptId` uniqueness lives in the DB layer,
 * not here).
 */
export function applyEvent(prev: MasteryInputs, event: AttemptEvent, eventAt: Date): MasteryInputs {
  const decayed = decaySums(
    { weightedCorrect: prev.weightedCorrect, weightedTotal: prev.weightedTotal },
    prev.lastAttemptAt,
    eventAt
  );
  const delta = computeEventDelta(event);

  const weightedCorrect = decayed.weightedCorrect + delta.eventCorrect;
  const weightedTotal = decayed.weightedTotal + delta.eventTotal;
  const postEventLcb = wilsonLcb(weightedCorrect, weightedTotal);

  return {
    weightedCorrect,
    weightedTotal,
    attemptCount: prev.attemptCount + 1,
    lastAttemptAt: eventAt,
    lastCorrectAt: event.isCorrect ? eventAt : prev.lastCorrectAt,
    peakLcb: nextPeakLcb(prev.peakLcb, postEventLcb),
  };
}

// ─── Read path: classify the band ──────────────────────────────────────

/**
 * Re-decay `inputs`' stored sums to `now`, recompute the lcb, then return
 * the authoritative {@link MasteryBand}. This is THE function every read
 * surface (`deriveConceptWeakAreas`, the DB write-cache refresh, future UI)
 * must call instead of trusting a stored `status` string — see §2.1.1 in
 * the file header.
 *
 * Precedence (highest first), per plan §2.1 table:
 *   1. `rusty`     — overrides what would otherwise read as `building`/`weak`
 *                    on a concept that was once `solid`. Requires real prior
 *                    evidence (`peakLcb >= SOLID_AT_OR_ABOVE_LCB`); a concept
 *                    that was never solid cannot become `rusty` merely by
 *                    decaying toward 50.
 *   2. `untested`  — re-decayed `weightedTotal` below the confidence gate;
 *                    never reads as `weak` regardless of lcb.
 *   3. `solid` / `building` / `weak` — standard lcb bands once there is
 *                    enough evidence.
 *
 * `strengthening` is NOT produced by this function — it is a graduation
 * state set by the write path on a passed re-test pending a 2nd separate
 * calendar day (§2.4), which this pure read-time classifier has no way to
 * know about (it isn't in `MasteryInputs`). Callers that track graduation
 * state apply that override on top of this function's result.
 */
export function classifyBand(inputs: MasteryInputs, now: Date): MasteryBand {
  const decayed = decaySums(
    { weightedCorrect: inputs.weightedCorrect, weightedTotal: inputs.weightedTotal },
    inputs.lastAttemptAt,
    now
  );
  const lcb = wilsonLcb(decayed.weightedCorrect, decayed.weightedTotal);

  const wasSolid = inputs.peakLcb >= SOLID_AT_OR_ABOVE_LCB;
  const daysSinceLastAttempt = inputs.lastAttemptAt
    ? (now.getTime() - inputs.lastAttemptAt.getTime()) / (1000 * 60 * 60 * 24)
    : Infinity;
  const isStale = daysSinceLastAttempt > RUSTY_AFTER_DAYS;

  // 1. `rusty` takes precedence over `building`/`weak` for a once-solid
  //    concept that has gone stale and dropped below the rusty threshold.
  if (wasSolid && isStale && lcb < RUSTY_BELOW_LCB) {
    return 'rusty';
  }

  // 2. Not enough (re-decayed) evidence to flag either way.
  if (decayed.weightedTotal < UNTESTED_BELOW_TOTAL) {
    return 'untested';
  }

  // 3. Standard lcb bands.
  if (lcb >= SOLID_AT_OR_ABOVE_LCB) return 'solid';
  if (lcb < WEAK_BELOW_LCB) return 'weak';
  return 'building';
}

// ─── Graduation (§2.4) ──────────────────────────────────────────────────

/**
 * Count of DISTINCT UTC calendar days present in `dates`. Pure — days are
 * compared by their UTC `YYYY-MM-DD` component, so two timestamps on the
 * same UTC day collapse to one, and a timestamp just before vs. just after
 * UTC midnight count as two distinct days even if only milliseconds apart.
 * Order/duplicates in the input don't matter.
 */
export function countDistinctCalendarDays(dates: Date[]): number {
  const seen = new Set<string>();
  for (const date of dates) {
    seen.add(
      `${date.getUTCFullYear()}-${date.getUTCMonth()}-${date.getUTCDate()}`
    );
  }
  return seen.size;
}

/**
 * True iff `status` denotes a concept in a struggling band — weak,
 * mid-recovery (`strengthening`), or rusty. Shared truth-test used by
 * {@link resolveGraduationBand}'s `wasStruggling` gate and by the write path
 * (`concept-write.ts`) to re-derive an effective `prevStatus` for the gate
 * when the raw stored `ConceptMastery.status` cache has gone stale (see
 * `concept-write.ts::recordConceptAttempt`'s `gatePrevStatus` derivation) —
 * the second-order bypass this export closes is documented there.
 */
export function isStrugglingStatus(status: string | null): boolean {
  return status === 'weak' || status === 'strengthening' || status === 'rusty';
}

/**
 * Graduation override layered on top of {@link classifyBand}'s result
 * (§2.4). `classifyBand` alone cannot express graduation because it has no
 * memory of the PREVIOUS status or of which calendar days carried a correct
 * re-test — both are write-path-only bookkeeping. This function takes those
 * two extra pieces of state and decides whether a `solid`-reading concept
 * has actually earned `solid` yet:
 *
 * - If `baseBand === 'solid'` but the concept was never struggling
 *   (`prevStatus` isn't weak/strengthening/rusty — e.g. untested, building,
 *   already solid, or no prior row at all), reaching `solid` is not a
 *   "graduation" in the §2.4 sense; it passes through immediately.
 * - If `baseBand === 'solid'` AND `prevStatus` was weak/strengthening/rusty
 *   (i.e. this concept is climbing OUT of a struggling state), it must have
 *   a correct re-test on at least {@link GRADUATION_MIN_CORRECT_DAYS}
 *   distinct calendar days — otherwise it reads `strengthening` instead of
 *   `solid`, no matter how high the lcb is. This is what prevents "two
 *   retries minutes apart" from counting as graduation.
 *
 * STICKY `strengthening` (mid-recovery `building` OR `untested`) — closes
 * TWO same-day graduation bypasses:
 *
 * The write path (`concept-write.ts` `recordConceptAttempt`) persists this
 * function's OUTPUT as `ConceptMastery.status` on EVERY write. Two distinct
 * bypasses share the same root cause — a non-`solid` `baseBand` passing
 * through unchanged erases the "this concept was struggling" memory before
 * the climb finishes:
 *
 * 1. A concept climbing out of `weak` via several same-day correct answers
 *    necessarily passes through the `building` lcb range on its way to
 *    `solid` (weak → building → solid). If a bare `'building'` got written
 *    mid-climb, the very next same-day correct answer would see
 *    `prevStatus === 'building'` — NOT in the struggling set — so
 *    `wasStruggling` would be false and the concept would graduate with
 *    every correct answer on a single UTC day.
 * 2. A concept whose stored status is stale (e.g. DB says `'weak'` or
 *    `'solid'`-now-actually-`'rusty'`) after a long dormancy: the first
 *    post-dormancy event's heavy decay can produce `baseBand === 'untested'`
 *    directly (skipping over `building` entirely). A bare `'untested'`
 *    passthrough erases the struggling memory just as effectively as case 1
 *    — same-day corrects immediately following would climb
 *    untested→building→solid ungated. This is the confirmed second-order
 *    defect this sticky rule now also covers.
 *
 * The fix: while a concept is recovering from a struggling state
 * (`wasStruggling`), a `baseBand` of EITHER `'building'` OR `'untested'` is
 * ALSO reported as `'strengthening'` instead of the bare `classifyBand`
 * output. This keeps the "this concept was struggling and hasn't cleared
 * the distinct-day gate yet" memory alive across the whole recovery climb
 * — regardless of which non-solid bands it passes through — so the gate
 * above still sees `wasStruggling=true` on the write that finally reaches
 * `baseBand==='solid'`.
 *
 * Read surfaces are unaffected: they recompute the display band via
 * {@link classifyBand}, which never emits `'strengthening'` on its own — a
 * sticky-`strengthening` row still displays as `untested`/`building`/`solid`
 * appropriately from re-decayed sums (and the §6.2 pre-filter
 * `status IN ('weak','building','strengthening','rusty')` still includes
 * `'strengthening'`, so a decayed-but-sticky row is scanned, recomputed to
 * `'untested'` at read time, and correctly not surfaced as a weak spot). The
 * sticky value written here is durable WRITE-PATH MEMORY only (what
 * `prevStatus` will be next write), not something a read path trusts
 * directly — §2.1.1's cache semantics for reads are unchanged.
 */
export function resolveGraduationBand(
  baseBand: MasteryBand,
  prevStatus: string | null,
  distinctCorrectDays: number
): MasteryBand {
  const wasStruggling = isStrugglingStatus(prevStatus);

  if ((baseBand === 'building' || baseBand === 'untested') && wasStruggling) {
    return 'strengthening';
  }

  if (baseBand !== 'solid') return baseBand;

  if (!wasStruggling) return baseBand;

  if (distinctCorrectDays < GRADUATION_MIN_CORRECT_DAYS) {
    return 'strengthening';
  }
  return 'solid';
}
