/**
 * Weakness Training Phase 4.4a — nudge escalation machine + daily sweep.
 * See plans/weakness-training-phase4.md §14.
 *
 * PURE trigger functions (§14.2) operate over already-loaded data (the
 * `loadConceptWeakAreaRows` union + targeted `ConceptAttemptEvent` lookups)
 * so they're independently unit-testable without a DB. The sweep/evaluate
 * functions are the DB-wired orchestration layer around them.
 *
 * Per-user state machine (§14.1): a learner with N weak concepts gets ONE
 * digest, never N emails — triggers are unioned into a single severity
 * decision, never fanned out per concept.
 */

import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { weaknessNudgeSweepEnabled } from '@/lib/feature-flags';
import { enqueueJob } from '@/lib/background-jobs';
import { loadConceptWeakAreaRows } from '@/lib/concept-weak-areas-loader';
import { deriveConceptWeakAreas, type ConceptWeakArea } from '@/lib/concept-weak-areas';
import {
  sendWeaknessNudgeEmail,
  type WeaknessNudgeConceptLine,
  type WeaknessNudgeTriggerKind,
} from '@/lib/weakness-nudge-email';

// ─── Constants (plan §14.3 — retune here, not inline) ──────────────────────

/** A `weak`-band concept with zero attempt events in this many days is
 *  "ignored" — flagged even though nothing has changed about its mastery. */
export const IGNORED_WEAK_DAYS = 7;

/** Consecutive weakness-session retest failures (both incorrect) needed to
 *  fire the "the re-teach isn't working" trigger. */
export const RETEST_FAILURE_STREAK = 2;

/** After a digest is sent and ignored, wait this many days before the one
 *  allowed re-nudge. */
export const RE_NUDGE_HORIZON_DAYS = 7;

/** At most one re-nudge per NUDGE_ELIGIBLE→NUDGED cycle (§14.1). Not
 *  enforced by this sub-phase's sweep (no re-nudge scheduling here yet — the
 *  weekly email cap is the practical limiter) but exported so 4.4b's tile
 *  escalation logic shares the same constant. */
export const MAX_RE_NUDGES = 1;

/** A trigger that's been eligible-but-unsent this long is stale — never
 *  deliver ancient news. */
export const TRIGGER_STALE_DAYS = 14;

/** Hard cap — the digest IS the weekly allotment. */
export const MAX_EMAILS_PER_USER_PER_WEEK = 1;

/** At most one in-app nudge surfaced per session (4.4b uses this; kept here
 *  since it's a §14.3 constant). */
export const MAX_INAPP_NUDGES_PER_SESSION = 1;

/** How often the daily sweep chain re-fires (ms), env-overridable. */
export const NUDGE_SWEEP_INTERVAL_MS = Number(
  process.env.WEAKNESS_NUDGE_SWEEP_INTERVAL_MS ?? 24 * 60 * 60_000,
);

/** Users processed per resumable sweep page. */
export const SWEEP_PAGE_SIZE = 500;

/** Recent-activity suppression window — an active user doesn't need a nudge,
 *  the dashboard tile is enough (§14.3). */
export const RECENT_ACTIVITY_SUPPRESSION_HOURS = 48;

/** `peakLcb` floor for the rusty-transition trigger (§14.2). */
export const RUSTY_TRANSITION_MIN_PEAK_LCB = 0.75;

/** Cap on concepts listed in one digest. */
export const MAX_DIGEST_CONCEPTS = 5;

// ─── Types ──────────────────────────────────────────────────────────────

export interface TriggerCandidate {
  conceptId: string;
  label: string;
  whyFlagged: string;
}

export interface TriggerResult {
  kind: WeaknessNudgeTriggerKind;
  candidates: TriggerCandidate[];
}

// ─── Pure trigger functions (§14.2) ────────────────────────────────────────

/**
 * "Ignored weak concept" — `weak` band with zero `ConceptAttemptEvent` in
 * the last {@link IGNORED_WEAK_DAYS} days. `areas` is already `weak`/`rusty`
 * only (deriveConceptWeakAreas' output); `daysSinceLastAttempt === null`
 * (never attempted) also qualifies — there is trivially "zero events in the
 * window" for a concept that's never been attempted at all.
 */
export function findIgnoredWeakConcepts(areas: ConceptWeakArea[]): TriggerCandidate[] {
  return areas
    .filter((a) => a.band === 'weak')
    .filter((a) => a.daysSinceLastAttempt === null || a.daysSinceLastAttempt >= IGNORED_WEAK_DAYS)
    .map((a) => ({ conceptId: a.conceptId, label: a.label, whyFlagged: a.whyFlagged }));
}

/** Raw `ConceptMastery` row shape needed for the graduation-available
 *  trigger — `deriveConceptWeakAreas` never surfaces `strengthening` rows
 *  (they aren't `weak`/`rusty`), so this trigger reads the denormalised
 *  `status` cache directly (§2.1.1 — "cache for cheap indexed filtering"). */
export interface StrengtheningMasteryRow {
  conceptId: string;
  label: string;
}

/**
 * "Graduation available" — concept sitting at `strengthening` (mid-recovery,
 * one correct re-test day away from graduating). Encouraging framing, never
 * a claim about the learner's psychology.
 */
export function findGraduationAvailableConcepts(
  rows: StrengtheningMasteryRow[],
): TriggerCandidate[] {
  return rows.map((r) => ({
    conceptId: r.conceptId,
    label: r.label,
    whyFlagged: `${r.label} is one correct day away from graduating.`,
  }));
}

/**
 * "Decayed to rusty" — `peakLcb >= RUSTY_TRANSITION_MIN_PEAK_LCB` and the
 * re-decayed band reads `rusty`. Every `rusty`-band row `deriveConceptWeakAreas`
 * can produce already satisfies the peakLcb floor by construction —
 * `classifyBand`'s `wasSolid` gate requires
 * `peakLcb >= SOLID_AT_OR_ABOVE_LCB` (0.75, `concept-mastery.ts`), the same
 * value as {@link RUSTY_TRANSITION_MIN_PEAK_LCB} — so this function only
 * needs the band filter plus the dedup. `alreadyNudgedRustyConceptIds` is
 * the set of concept ids already logged with trigger 'rusty' in a PRIOR
 * digest — the "first sweep to observe the transition" dedup (§14.2),
 * caller resolves it from `WeaknessNudgeLog.conceptIds`/`triggerKinds`.
 */
export function findRustyTransitionConcepts(
  areas: ConceptWeakArea[],
  alreadyNudgedRustyConceptIds: ReadonlySet<string>,
): TriggerCandidate[] {
  return areas
    .filter((a) => a.band === 'rusty')
    .filter((a) => !alreadyNudgedRustyConceptIds.has(a.conceptId))
    .map((a) => ({ conceptId: a.conceptId, label: a.label, whyFlagged: a.whyFlagged }));
}

/** One concept's last-N `ConceptAttemptEvent` rows scoped to
 *  `origin='weakness_session'`, most recent first — the input to the
 *  retest-failure-streak trigger. */
export interface RetestEvent {
  conceptId: string;
  label: string;
  isCorrect: boolean;
}

/**
 * "Retest failure streak" — the last {@link RETEST_FAILURE_STREAK} events
 * for a concept (already filtered to `origin='weakness_session'` by the
 * caller's query, most-recent-first) are ALL incorrect. `eventsByConcept`
 * maps conceptId → its most-recent-first event list (caller bounds each
 * list to `RETEST_FAILURE_STREAK` rows — one indexed query per candidate
 * concept, per the design's "bounded" requirement).
 */
export function findRetestFailureStreakConcepts(
  eventsByConcept: Map<string, RetestEvent[]>,
): TriggerCandidate[] {
  const out: TriggerCandidate[] = [];
  for (const [conceptId, events] of eventsByConcept) {
    if (events.length < RETEST_FAILURE_STREAK) continue;
    const streak = events.slice(0, RETEST_FAILURE_STREAK);
    if (streak.every((e) => !e.isCorrect)) {
      out.push({
        conceptId,
        label: events[0].label,
        whyFlagged: `Missed the last ${RETEST_FAILURE_STREAK} retests on ${events[0].label}.`,
      });
    }
  }
  return out;
}

// ─── Digest assembly ────────────────────────────────────────────────────

const TRIGGER_PRIORITY: WeaknessNudgeTriggerKind[] = [
  'retest_failing',
  'rusty',
  'ignored_weak',
  'graduation_available',
];

/**
 * Union the four trigger results into one digest: dedupe concepts (a
 * concept can qualify under multiple triggers — keep its highest-priority
 * trigger's line), cap at {@link MAX_DIGEST_CONCEPTS}, ordered by trigger
 * priority (§16 Q13: retest_failing > rusty > ignored_weak >
 * graduation_available).
 */
export function assembleDigest(results: TriggerResult[]): {
  triggerKinds: WeaknessNudgeTriggerKind[];
  concepts: WeaknessNudgeConceptLine[];
  conceptIds: string[];
} {
  const byKind = new Map(results.map((r) => [r.kind, r]));
  const seenConcepts = new Set<string>();
  const concepts: WeaknessNudgeConceptLine[] = [];
  const triggerKinds: WeaknessNudgeTriggerKind[] = [];

  for (const kind of TRIGGER_PRIORITY) {
    const result = byKind.get(kind);
    if (!result || result.candidates.length === 0) continue;
    triggerKinds.push(kind);
    for (const c of result.candidates) {
      if (seenConcepts.has(c.conceptId)) continue;
      if (concepts.length >= MAX_DIGEST_CONCEPTS) continue;
      seenConcepts.add(c.conceptId);
      concepts.push({ conceptId: c.conceptId, whyFlagged: c.whyFlagged });
    }
  }

  return { triggerKinds, concepts, conceptIds: concepts.map((c) => c.conceptId) };
}

// ─── Severity (§14.1 ESCALATED, §14.8 4.4b) ────────────────────────────────

/**
 * Pure severity score for one digest — used ONLY to compare today's digest
 * against a user's prior unresolved 'nudged' digest to decide whether it
 * should flip to 'escalated' (§14.1: "severity strictly increased while
 * NUDGED"). `retest_failing` presence counts double (the re-teach isn't
 * working is a stronger signal than a fresh weak/rusty/graduation flag),
 * then the total triggered-concept count is added — so a digest with
 * `retest_failing` always outranks one without it regardless of concept
 * count, and among digests that agree on `retest_failing` presence, more
 * flagged concepts is strictly more severe. Deliberately ignorant of which
 * OTHER triggers fired — only retest_failing gets special weight (plan
 * §14.8's wording is narrow: "presence of retest_failing counts double, else
 * total triggered-concept count").
 */
export function digestSeverity(triggerResults: TriggerResult[]): number {
  const hasRetestFailing = triggerResults.some(
    (r) => r.kind === 'retest_failing' && r.candidates.length > 0,
  );
  const conceptCount = new Set(
    triggerResults.flatMap((r) => r.candidates.map((c) => c.conceptId)),
  ).size;
  return hasRetestFailing ? conceptCount * 2 : conceptCount;
}

/**
 * Severity of an already-persisted `WeaknessNudgeLog` row, reconstructed
 * from its denormalised `triggerKinds`/`conceptIds` columns (the row doesn't
 * retain per-trigger candidate partitions, only their union — §14.5's
 * schema). Same formula as {@link digestSeverity}: `retest_failing`
 * presence in `triggerKinds` counts the concept total double, otherwise the
 * plain count.
 */
export function loggedDigestSeverity(row: {
  triggerKinds: string[];
  conceptIds: string[];
}): number {
  const hasRetestFailing = row.triggerKinds.includes('retest_failing' satisfies WeaknessNudgeTriggerKind);
  const conceptCount = new Set(row.conceptIds).size;
  return hasRetestFailing ? conceptCount * 2 : conceptCount;
}

// ─── Window keys ────────────────────────────────────────────────────────

/** `YYYY-MM-DD` (UTC) for the in-app dedup window key. */
export function isoDateKey(at: Date): string {
  return at.toISOString().slice(0, 10);
}

/** `YYYY-Www` (UTC, ISO-8601 week) for the weekly email dedup window key. */
export function isoWeekKey(at: Date): string {
  const d = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
  // ISO week: Thursday of this week determines the week-numbering year.
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

function isPrismaUniqueError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

// ─── Per-user evaluation ────────────────────────────────────────────────

export interface EvaluateAndNudgeResult {
  evaluated: boolean;
  triggered: boolean;
  inAppLogged: boolean;
  emailSent: boolean;
}

/**
 * Evaluate one user's weak-spot signal and, if warranted, write the in-app
 * nudge log row and (subject to the weekly cap) send the email digest.
 * Never throws — a failure here must not stop the sweep page.
 */
export async function evaluateAndNudgeUser(
  userId: string,
  now: Date,
): Promise<EvaluateAndNudgeResult> {
  const noop: EvaluateAndNudgeResult = {
    evaluated: false,
    triggered: false,
    inAppLogged: false,
    emailSent: false,
  };

  try {
    // (a) Pref gate FIRST — a missing prefs row defaults to true (opt-in),
    // matching notification-preferences.ts's DEFAULT_NOTIFICATION_PREFS
    // idiom. This must short-circuit before ANY mastery read.
    const prefs = await db.userNotificationPreferences.findUnique({
      where: { userId },
      select: { weakSpotNudges: true },
    });
    if (prefs?.weakSpotNudges === false) return noop;

    // (e-precondition) Recent-activity suppression — an active user doesn't
    // need a nudge; the dashboard tile is enough (§14.3). `User.lastSeenAt`
    // is bumped on every dashboard SSR visit (see
    // WelcomeBackServerGate.tsx) — cheaper than scanning
    // ConceptAttemptEvent for "any event in 48h".
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { email: true, emailVerified: true, lastSeenAt: true },
    });
    if (!user) return noop;
    if (user.lastSeenAt) {
      const hoursSinceSeen = (now.getTime() - user.lastSeenAt.getTime()) / (1000 * 60 * 60);
      if (hoursSinceSeen < RECENT_ACTIVITY_SUPPRESSION_HOURS) return { ...noop, evaluated: true };
    }

    // (b) Load weak areas via the shared loader (§10.2 — the ONE place that
    // reads ConceptMastery for weak-area purposes).
    const rows = await loadConceptWeakAreaRows(userId);
    const derived = deriveConceptWeakAreas({ concepts: rows, now, scope: { scope: 'all-paths' } });
    const areas = derived.areas;

    // (c) Evaluate the four triggers. Note graduation-available reads
    // `ConceptMastery.status` directly below rather than `areas` — a
    // strengthening concept can exist even when `areas` is empty (it isn't
    // `weak`/`rusty`, so `deriveConceptWeakAreas` never surfaces it).
    const alreadyNudgedRustyConceptIds = await loadAlreadyNudgedConceptIds(userId, 'rusty');

    const ignoredWeak = findIgnoredWeakConcepts(areas);
    const rustyTransition = findRustyTransitionConcepts(areas, alreadyNudgedRustyConceptIds);

    const strengtheningRows = await db.conceptMastery.findMany({
      where: { userId, status: 'strengthening' },
      select: { conceptId: true, concept: { select: { label: true } } },
    });
    const graduationAvailable = findGraduationAvailableConcepts(
      strengtheningRows.map((r) => ({ conceptId: r.conceptId, label: r.concept.label })),
    );

    const retestCandidateConceptIds = new Set<string>([
      ...areas.map((a) => a.conceptId),
      ...strengtheningRows.map((r) => r.conceptId),
    ]);
    const retestEventsByConcept = await loadRetestEventsByConcept(userId, retestCandidateConceptIds);
    const retestFailing = findRetestFailureStreakConcepts(retestEventsByConcept);

    const digest = assembleDigest([
      { kind: 'retest_failing', candidates: retestFailing },
      { kind: 'rusty', candidates: rustyTransition },
      { kind: 'ignored_weak', candidates: ignoredWeak },
      { kind: 'graduation_available', candidates: graduationAvailable },
    ]);

    if (digest.triggerKinds.length === 0) return { ...noop, evaluated: true };

    // (d0) ESCALATED severity check (§14.1, §14.8 4.4b) — a user's PRIOR
    // unresolved 'nudged' in-app row, from an earlier window than today's,
    // flips to 'escalated' when today's digest is STRICTLY more severe.
    // This is purely an in-app urgency upgrade on an existing row — it does
    // NOT write a second email log row and does NOT touch the weekly
    // windowKey guard below, so "never unlocks a second email inside the
    // same week" holds unconditionally.
    const todaySeverity = digestSeverity([
      { kind: 'retest_failing', candidates: retestFailing },
      { kind: 'rusty', candidates: rustyTransition },
      { kind: 'ignored_weak', candidates: ignoredWeak },
      { kind: 'graduation_available', candidates: graduationAvailable },
    ]);
    const inAppWindowKey = `${userId}:${isoDateKey(now)}`;
    const priorNudged = await db.weaknessNudgeLog.findFirst({
      where: {
        userId,
        channel: 'in_app',
        state: 'nudged',
        windowKey: { not: inAppWindowKey },
      },
      orderBy: { sentAt: 'desc' },
      select: { id: true, triggerKinds: true, conceptIds: true },
    });
    if (priorNudged && todaySeverity > loggedDigestSeverity(priorNudged)) {
      try {
        await db.weaknessNudgeLog.updateMany({
          where: { id: priorNudged.id, state: 'nudged' },
          data: { state: 'escalated' },
        });
      } catch (error) {
        console.error('[weakness-nudges] escalation flip failed', {
          userId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // (d) Write the in-app WeaknessNudgeLog row. Unique-constraint collision
    // = already nudged today = stop (never double-send within the window).
    let inAppLogged = false;
    try {
      await db.weaknessNudgeLog.create({
        data: {
          userId,
          channel: 'in_app',
          triggerKinds: digest.triggerKinds,
          conceptIds: digest.conceptIds,
          windowKey: inAppWindowKey,
          state: 'nudged',
          sentAt: now,
        },
      });
      inAppLogged = true;
    } catch (error) {
      if (!isPrismaUniqueError(error)) throw error;
      // Already nudged today via in-app — per §14.6 the log's unique
      // constraint is the last line of defense; stop here (both channels
      // share one digest decision per user per sweep run).
      return { ...noop, evaluated: true };
    }

    // Email rung: weakSpotNudges already gates both channels (checked
    // above); weekly windowKey unique guard + confirmed-email check.
    let emailSent = false;
    if (user.email && user.emailVerified) {
      const emailWindowKey = `${userId}:${isoWeekKey(now)}`;
      try {
        await db.weaknessNudgeLog.create({
          data: {
            userId,
            channel: 'email',
            triggerKinds: digest.triggerKinds,
            conceptIds: digest.conceptIds,
            windowKey: emailWindowKey,
            state: 'nudged',
            sentAt: now,
          },
        });
        emailSent = await sendWeaknessNudgeEmail(user.email, {
          triggerKinds: digest.triggerKinds,
          concepts: digest.concepts,
        });
      } catch (error) {
        if (!isPrismaUniqueError(error)) {
          console.error('[weakness-nudges] email log write failed', {
            userId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
        // Unique collision = already emailed this week — no second send.
      }
    }

    return { evaluated: true, triggered: true, inAppLogged, emailSent };
  } catch (error) {
    console.error('[weakness-nudges] evaluateAndNudgeUser failed', {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
    return noop;
  }
}

/** Concept ids already covered by a prior digest carrying `trigger` in its
 *  `triggerKinds`, scoped to this user — the "first sweep to observe the
 *  transition" dedup for the rusty trigger (§14.2). */
async function loadAlreadyNudgedConceptIds(
  userId: string,
  trigger: WeaknessNudgeTriggerKind,
): Promise<Set<string>> {
  const logs = await db.weaknessNudgeLog.findMany({
    where: { userId, triggerKinds: { has: trigger } },
    select: { conceptIds: true },
  });
  const ids = new Set<string>();
  for (const log of logs) {
    for (const id of log.conceptIds) ids.add(id);
  }
  return ids;
}

/** Load, per candidate concept, the last `RETEST_FAILURE_STREAK`
 *  `origin='weakness_session'` events (most recent first) — one indexed
 *  query per candidate concept, bounded by the candidate set size (which is
 *  itself bounded by the user's weak/rusty/strengthening concepts, never
 *  the full concept catalog). */
async function loadRetestEventsByConcept(
  userId: string,
  candidateConceptIds: ReadonlySet<string>,
): Promise<Map<string, RetestEvent[]>> {
  const out = new Map<string, RetestEvent[]>();
  const ids = Array.from(candidateConceptIds);
  if (ids.length === 0) return out;

  await Promise.all(
    ids.map(async (conceptId) => {
      const events = await db.conceptAttemptEvent.findMany({
        where: { userId, conceptId, origin: 'weakness_session' },
        orderBy: { createdAt: 'desc' },
        take: RETEST_FAILURE_STREAK,
        select: { isCorrect: true, concept: { select: { label: true } } },
      });
      if (events.length === 0) return;
      out.set(
        conceptId,
        events.map((e) => ({ conceptId, label: e.concept.label, isCorrect: e.isCorrect })),
      );
    }),
  );

  return out;
}

// ─── On-read resolution ─────────────────────────────────────────────────

/**
 * Best-effort flip of any 'nudged'/'escalated' WeaknessNudgeLog rows for
 * this user to 'resolved' — called when the user visits weak-spots or the
 * dashboard (§14.1: "user visits weak-spots/dashboard ... → RESOLVED,
 * immediate, on-read"). Never throws; the caller fires this without
 * awaiting the result blocking render.
 */
export async function resolveNudgesForUser(userId: string): Promise<void> {
  try {
    await db.weaknessNudgeLog.updateMany({
      where: { userId, state: { in: ['nudged', 'escalated'] } },
      data: { state: 'resolved', resolvedAt: new Date() },
    });
  } catch (error) {
    console.error('[weakness-nudges] resolveNudgesForUser failed', {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// ─── Sweep scheduling (mirrors scheduleNextReminderSweep/bootstrapReminderSweep) ──

/**
 * Interval-aligned dedupe key for a sweep scheduled at `at`, mirroring
 * `sweepDedupeKey` in background-jobs.ts — bucketing by the interval means a
 * self-reschedule and a worker-start bootstrap targeting the same window
 * collapse to one job.
 */
function sweepDedupeKey(at: Date): string {
  return `weakness.nudge_sweep:${Math.floor(at.getTime() / NUDGE_SWEEP_INTERVAL_MS)}`;
}

/** Enqueue the next daily sweep one interval out. Never throws. Flag-gated
 *  (a disabled flag means there's nothing to schedule). */
export async function scheduleNextNudgeSweep(after: Date = new Date()): Promise<void> {
  if (!weaknessNudgeSweepEnabled()) return;
  const next = new Date(after.getTime() + NUDGE_SWEEP_INTERVAL_MS);
  try {
    await enqueueJob(
      'weakness.nudge_sweep',
      {},
      { dedupeKey: sweepDedupeKey(next), runAt: next, maxAttempts: 1 },
    );
  } catch (error) {
    console.error('[weakness-nudges] failed to schedule next nudge sweep', error);
  }
}

/** Seed a sweep for the current interval at worker start. Idempotent via
 *  the bucketed dedupeKey. Never throws. Flag-gated. */
export async function bootstrapNudgeSweep(): Promise<void> {
  if (!weaknessNudgeSweepEnabled()) return;
  const now = new Date();
  try {
    await enqueueJob(
      'weakness.nudge_sweep',
      {},
      { dedupeKey: sweepDedupeKey(now), runAt: now, maxAttempts: 1 },
    );
  } catch (error) {
    console.error('[weakness-nudges] failed to bootstrap nudge sweep', error);
  }
}

// ─── Resumable sweep page (§14.6) ───────────────────────────────────────

/** dedupeKey for a same-page continuation, distinct from the daily-tick key
 *  so a mid-day self-enqueue can't collide with the interval bucket. */
function pageDedupeKey(isoDate: string, lastId: string): string {
  return `weakness.nudge_sweep:page:${isoDate}:${lastId}`;
}

/**
 * Run one resumable sweep page (≤{@link SWEEP_PAGE_SIZE} users). Pages of
 * distinct `ConceptMastery.userId`s ordered ascending (there is no `User` →
 * `ConceptMastery` Prisma relation — `ConceptMastery.userId` is a plain FK
 * column, not a relation field — so "users having ≥1 ConceptMastery row" is
 * a distinct-userId scan over `ConceptMastery` itself, not a `User` filter),
 * resuming from the durable `NudgeSweepWatermark` cursor. If the page is
 * full, self-enqueues its own continuation and returns `{ done: false }` —
 * only a page that reads fewer than a full page's worth of users is the end
 * of today's pass (which resets the cursor). Never throws — every DB step
 * is defensive so a bad page can't wedge the daily chain.
 */
export async function runWeaknessNudgeSweepPage(): Promise<{ processed: number; done: boolean }> {
  if (!weaknessNudgeSweepEnabled()) return { processed: 0, done: true };

  const now = new Date();
  const today = isoDateKey(now);

  try {
    const watermark = await db.nudgeSweepWatermark.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton' },
      update: {},
    });

    // Same-day cursor resume: if the last completed run was today, resume
    // from lastCursor. A new day (or no prior run) starts fresh from null.
    const lastRunIsoDate = watermark.lastRunAt ? isoDateKey(watermark.lastRunAt) : null;
    const cursor = lastRunIsoDate === today ? watermark.lastCursor : null;

    const masteryRows = await db.conceptMastery.findMany({
      where: cursor ? { userId: { gt: cursor } } : undefined,
      orderBy: { userId: 'asc' },
      distinct: ['userId'],
      take: SWEEP_PAGE_SIZE,
      select: { userId: true },
    });
    const users = masteryRows.map((r) => ({ id: r.userId }));

    for (const user of users) {
      await evaluateAndNudgeUser(user.id, now);
    }

    const lastId = users.length > 0 ? users[users.length - 1].id : cursor;
    const pageFull = users.length === SWEEP_PAGE_SIZE;

    await db.nudgeSweepWatermark.update({
      where: { id: 'singleton' },
      data: {
        lastCursor: pageFull ? lastId : null,
        lastRunAt: now,
      },
    });

    if (pageFull && lastId) {
      try {
        await enqueueJob(
          'weakness.nudge_sweep',
          {},
          { dedupeKey: pageDedupeKey(today, lastId), runAt: now, maxAttempts: 1 },
        );
      } catch (error) {
        console.error('[weakness-nudges] failed to enqueue sweep continuation', error);
      }
      return { processed: users.length, done: false };
    }

    return { processed: users.length, done: true };
  } catch (error) {
    console.error('[weakness-nudges] sweep page failed', error);
    // Fail-safe: report done so the outer runner still perpetuates the
    // daily chain rather than getting stuck retrying a broken page forever.
    return { processed: 0, done: true };
  }
}
