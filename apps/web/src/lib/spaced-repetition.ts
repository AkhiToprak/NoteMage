export interface SM2Result {
  easeFactor: number;
  interval: number;
  repetitions: number;
  nextReviewAt: Date;
}

/**
 * SM-2 spaced repetition algorithm
 * @param quality 0-5 rating (0-2 = wrong, 3 = hard, 4 = good, 5 = easy)
 */
export function sm2(
  quality: number,
  previousEF: number,
  previousInterval: number,
  previousRepetitions: number
): SM2Result {
  let ef = previousEF;
  let interval: number;
  let repetitions: number;

  if (quality < 3) {
    // Wrong answer — reset
    repetitions = 0;
    interval = 1;
  } else {
    // Correct answer
    repetitions = previousRepetitions + 1;
    if (repetitions === 1) {
      interval = 1;
    } else if (repetitions === 2) {
      interval = 6;
    } else {
      interval = Math.round(previousInterval * ef);
    }
  }

  // Adjust ease factor
  ef = ef + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  if (ef < 1.3) ef = 1.3;

  const nextReviewAt = new Date();
  nextReviewAt.setDate(nextReviewAt.getDate() + interval);
  nextReviewAt.setHours(0, 0, 0, 0);

  return { easeFactor: ef, interval, repetitions, nextReviewAt };
}

// ─── SM-2-lite (Weakness Training Phase 4.3, plan §13.4) ───────────────────
//
// Extends (never replaces) the classic `sm2()` above with two additions the
// base algorithm doesn't have: a hard cap on runaway intervals, and leech
// tracking (a card that keeps resetting from a mature repetition count gets
// flagged — never removed from rotation, just surfaced as "re-read the
// source"). Quality domain here is the 4-button UI's `0|3|4|5` (Again / —
// / Hard / Good / Easy — 1/2 are unused since there's no partial-credit
// button), not the full continuous 0-5 scale `sm2()` accepts.

/** Runaway-interval cap, in days — exam-prep timescales, not textbook SM-2's
 *  unbounded ease-factor growth. */
export const MAX_INTERVAL_DAYS = 180;

/** `lapses` count at/above this flags a card as a leech (plan §13.4) — never
 *  removed from rotation, just surfaced as a "re-read the source" nudge. */
export const LEECH_THRESHOLD = 4;

export interface SM2LiteResult {
  easeFactor: number;
  interval: number;
  repetitions: number;
  lapses: number;
  nextReviewAt: Date;
  /** True once `lapses >= LEECH_THRESHOLD` after this grade. */
  isLeech: boolean;
}

/**
 * SM-2-lite: the same EF formula and 1 -> 6 -> round(prev * EF) interval
 * ladder as {@link sm2}, plus:
 *  - `interval` is capped at {@link MAX_INTERVAL_DAYS} (applied AFTER the
 *    ladder/EF-floor math, so it never distorts the EF itself — only the
 *    resulting schedule).
 *  - `lapses` increments only when the answer resets the card
 *    (`quality < 3`) AND the card had already matured past the learning
 *    steps (`previousRepetitions >= 2`) — i.e. an "Again" on a brand-new or
 *    once-reviewed card (`previousRepetitions` 0 or 1) is normal first
 *    exposure, not a lapse. `isLeech` is `lapses >= LEECH_THRESHOLD` after
 *    this event.
 *
 * `nextReviewAt` = local midnight + `interval` days, matching `sm2()`'s own
 * `setDate` + `setHours(0,0,0,0)` normalization idiom (kept identical here
 * for consistency, including its "always today's local timezone" behavior).
 *
 * @param quality Button value: 0 (Again), 3 (Hard), 4 (Good), 5 (Easy).
 */
export function sm2Lite(
  quality: number,
  previousEF: number,
  previousInterval: number,
  previousRepetitions: number,
  previousLapses: number
): SM2LiteResult {
  const base = sm2(quality, previousEF, previousInterval, previousRepetitions);

  const isLapse = quality < 3 && previousRepetitions >= 2;
  const lapses = isLapse ? previousLapses + 1 : previousLapses;

  const interval = Math.min(base.interval, MAX_INTERVAL_DAYS);
  const nextReviewAt = new Date();
  nextReviewAt.setDate(nextReviewAt.getDate() + interval);
  nextReviewAt.setHours(0, 0, 0, 0);

  return {
    easeFactor: base.easeFactor,
    interval,
    repetitions: base.repetitions,
    lapses,
    nextReviewAt,
    isLeech: lapses >= LEECH_THRESHOLD,
  };
}
