import { describe, it, expect } from 'vitest';
import {
  applyEvent,
  chancePForKind,
  classifyBand,
  computeEventDelta,
  countDistinctCalendarDays,
  decaySums,
  evidenceWeightForKind,
  isStrugglingStatus,
  masteryScore,
  nextPeakLcb,
  qualityMultiplier,
  qualityScoreFor,
  resolveGraduationBand,
  wilsonLcb,
  GRADUATION_MIN_CORRECT_DAYS,
  RUSTY_AFTER_DAYS,
  SOLID_AT_OR_ABOVE_LCB,
  UNTESTED_BELOW_TOTAL,
  WEAK_BELOW_LCB,
  SOURCE_WEIGHT_GRADED,
  SOURCE_WEIGHT_FLASHCARD_SELF_GRADE,
  type AttemptEvent,
  type MasteryBand,
  type MasteryInputs,
} from './concept-mastery';

// ─── Fixture helpers ────────────────────────────────────────────────────

const DAY_MS = 1000 * 60 * 60 * 24;
const BASE = new Date('2026-01-01T00:00:00.000Z');

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

const EMPTY_INPUTS: MasteryInputs = {
  weightedCorrect: 0,
  weightedTotal: 0,
  attemptCount: 0,
  lastAttemptAt: null,
  lastCorrectAt: null,
  peakLcb: 0,
};

function tfEvent(isCorrect: boolean, overrides: Partial<AttemptEvent> = {}): AttemptEvent {
  return {
    kind: 'true_false',
    isCorrect,
    usedHint: false,
    attemptNumber: 1,
    tagWeight: 1.0,
    ...overrides,
  };
}

/** Apply a sequence of events, one per day starting at BASE, and return the
 *  final MasteryInputs plus the timestamp of the last event. */
function runSequence(
  start: MasteryInputs,
  events: AttemptEvent[],
  spacingDays: number = 1
): { inputs: MasteryInputs; lastEventAt: Date } {
  let inputs = start;
  let at = BASE;
  for (let i = 0; i < events.length; i++) {
    at = i === 0 ? BASE : addDays(at, spacingDays);
    inputs = applyEvent(inputs, events[i], at);
  }
  return { inputs, lastEventAt: at };
}

// ─── chancePForKind / evidenceWeightForKind ────────────────────────────

describe('chancePForKind', () => {
  it('maps every known QuestionKind', () => {
    expect(chancePForKind('mc')).toBeCloseTo(0.25);
    expect(chancePForKind('mc', 4)).toBeCloseTo(0.25);
    expect(chancePForKind('mc', 2)).toBeCloseTo(0.5);
    expect(chancePForKind('true_false')).toBeCloseTo(0.5);
    expect(chancePForKind('match_pairs')).toBeCloseTo(0.2);
    expect(chancePForKind('fill_blank')).toBe(0);
    expect(chancePForKind('equation')).toBe(0);
    expect(chancePForKind('code_write')).toBe(0);
    expect(chancePForKind('translation')).toBe(0);
    expect(chancePForKind('code_output')).toBe(0);
  });

  it('defaults unknown kinds to chanceP=0 (treated as free-input)', () => {
    expect(chancePForKind('some_future_kind')).toBe(0);
  });

  it('evidenceWeightForKind is 1 - chanceP', () => {
    expect(evidenceWeightForKind('true_false')).toBeCloseTo(0.5);
    expect(evidenceWeightForKind('mc')).toBeCloseTo(0.75);
    expect(evidenceWeightForKind('fill_blank')).toBeCloseTo(1.0);
  });
});

// ─── qualityMultiplier / qualityScoreFor ────────────────────────────────

describe('qualityMultiplier', () => {
  it('full credit only for correct, no hint, first try', () => {
    expect(qualityMultiplier(false, 1)).toBe(1.0);
  });
  it('partial credit for hint OR retry', () => {
    expect(qualityMultiplier(true, 1)).toBe(0.6);
    expect(qualityMultiplier(false, 2)).toBe(0.6);
    expect(qualityMultiplier(true, 3)).toBe(0.6);
  });
});

describe('qualityScoreFor', () => {
  it('0 for incorrect regardless of hint/attempt', () => {
    expect(qualityScoreFor(false, false, 1)).toBe(0);
    expect(qualityScoreFor(false, true, 3)).toBe(0);
  });
  it('2 for correct/no-hint/first-try, 1 otherwise', () => {
    expect(qualityScoreFor(true, false, 1)).toBe(2);
    expect(qualityScoreFor(true, true, 1)).toBe(1);
    expect(qualityScoreFor(true, false, 2)).toBe(1);
  });
});

// ─── computeEventDelta ──────────────────────────────────────────────────

describe('computeEventDelta', () => {
  it('qualityMultiplier 0.6 reduces eventCorrect but not eventTotal (hint case)', () => {
    const full = computeEventDelta(tfEvent(true));
    const partial = computeEventDelta(tfEvent(true, { usedHint: true }));
    expect(full.eventTotal).toBeCloseTo(partial.eventTotal);
    expect(partial.eventCorrect).toBeLessThan(full.eventCorrect);
    expect(partial.eventCorrect).toBeCloseTo(0.5 * 0.6 * 1.0);
    expect(full.eventCorrect).toBeCloseTo(0.5 * 1.0 * 1.0);
  });

  it('2nd-try-correct also reduces eventCorrect via the same 0.6 multiplier', () => {
    const retry = computeEventDelta(tfEvent(true, { attemptNumber: 2 }));
    expect(retry.eventCorrect).toBeCloseTo(0.5 * 0.6 * 1.0);
  });

  it('tagWeight 0.5 halves both eventTotal and eventCorrect for a secondary concept', () => {
    const primary = computeEventDelta(tfEvent(true, { tagWeight: 1.0 }));
    const secondary = computeEventDelta(tfEvent(true, { tagWeight: 0.5 }));
    expect(secondary.eventTotal).toBeCloseTo(primary.eventTotal / 2);
    expect(secondary.eventCorrect).toBeCloseTo(primary.eventCorrect / 2);
  });

  it('incorrect events always yield eventCorrect=0 but still accrue eventTotal', () => {
    const wrong = computeEventDelta(tfEvent(false));
    expect(wrong.eventCorrect).toBe(0);
    expect(wrong.eventTotal).toBeCloseTo(0.5);
  });

  it('free-input kinds (chanceP≈0) carry full evidence weight', () => {
    const d = computeEventDelta({
      kind: 'fill_blank',
      isCorrect: true,
      usedHint: false,
      attemptNumber: 1,
      tagWeight: 1.0,
    });
    expect(d.eventTotal).toBeCloseTo(1.0);
    expect(d.eventCorrect).toBeCloseTo(1.0);
  });
});

// ─── decaySums ──────────────────────────────────────────────────────────

describe('decaySums', () => {
  it('returns sums unchanged when fromAt is null (no prior attempt)', () => {
    const result = decaySums({ weightedCorrect: 3, weightedTotal: 5 }, null, BASE);
    expect(result.weightedCorrect).toBe(3);
    expect(result.weightedTotal).toBe(5);
  });

  it('halves the sums after exactly one half-life (14 days)', () => {
    const result = decaySums({ weightedCorrect: 4, weightedTotal: 8 }, BASE, addDays(BASE, 14));
    expect(result.weightedCorrect).toBeCloseTo(2);
    expect(result.weightedTotal).toBeCloseTo(4);
  });

  it('no decay at zero elapsed time', () => {
    const result = decaySums({ weightedCorrect: 4, weightedTotal: 8 }, BASE, BASE);
    expect(result.weightedCorrect).toBeCloseTo(4);
    expect(result.weightedTotal).toBeCloseTo(8);
  });
});

// ─── wilsonLcb ──────────────────────────────────────────────────────────

describe('wilsonLcb', () => {
  it('guards n=0 → 0', () => {
    expect(wilsonLcb(0, 0)).toBe(0);
  });

  it('p̂=1.0, n=5 gives a sensible lcb strictly below 1', () => {
    const lcb = wilsonLcb(5, 5);
    expect(lcb).toBeGreaterThan(0);
    expect(lcb).toBeLessThan(1);
  });

  it('p̂=0.5, n=2.5 is below the weak threshold (0.55)', () => {
    const lcb = wilsonLcb(1.25, 2.5);
    expect(lcb).toBeLessThan(WEAK_BELOW_LCB);
  });

  it('is monotonically increasing in p̂ for fixed n', () => {
    const lowP = wilsonLcb(1, 10);
    const midP = wilsonLcb(5, 10);
    const highP = wilsonLcb(9, 10);
    expect(midP).toBeGreaterThan(lowP);
    expect(highP).toBeGreaterThan(midP);
  });

  it('is monotonically increasing in n for fixed p̂=1.0 (more evidence → more confidence)', () => {
    const small = wilsonLcb(2, 2);
    const large = wilsonLcb(10, 10);
    expect(large).toBeGreaterThan(small);
  });
});

// ─── masteryScore ───────────────────────────────────────────────────────

describe('masteryScore', () => {
  it('reports 50 at zero data', () => {
    expect(masteryScore(0, 0)).toBeCloseTo(50);
  });

  it('approaches 100 with strong, consistent correctness and enough evidence', () => {
    const score = masteryScore(20, 20);
    expect(score).toBeGreaterThan(90);
  });
});

// ─── nextPeakLcb ────────────────────────────────────────────────────────

describe('nextPeakLcb', () => {
  it('keeps the max of prev and new', () => {
    expect(nextPeakLcb(0.3, 0.6)).toBe(0.6);
    expect(nextPeakLcb(0.8, 0.6)).toBe(0.8);
  });
});

// ─── applyEvent + classifyBand: acceptance scenarios (plan §8) ─────────

describe('acceptance: consistently-correct TRUE/FALSE eventually reaches solid', () => {
  it('does not cap below solid — climbs past the n>=2.5 gate then lcb>=0.75', () => {
    // §2.1: "~5 clean T/F to reach the n>=2.5 gate" is the no-decay arithmetic
    // (5 events x 0.5 evidence each = 2.5 exactly). Use same-day spacing for
    // this leg so inter-event decay doesn't eat into that count — decay's
    // effect on evidence accrual is covered separately below.
    const events = Array.from({ length: 5 }, () => tfEvent(true));
    const { inputs, lastEventAt } = runSequence(EMPTY_INPUTS, events, 0);

    expect(inputs.weightedTotal).toBeGreaterThanOrEqual(UNTESTED_BELOW_TOTAL);
    const bandAt5 = classifyBand(inputs, lastEventAt);
    // With p̂=1.0 at n=2.5 the Wilson lcb may not yet clear 0.75 — assert it
    // is at least not stuck at untested/weak.
    expect(bandAt5).not.toBe('untested');
    expect(bandAt5).not.toBe('weak');

    // Keep going correct — more reps tighten the confidence interval. This
    // is the marquee case from §2.1: format coarseness is slower confidence,
    // never a capped score. Space these out by a day each; despite the
    // decay this still climbs to solid because each event keeps adding
    // full-credit evidence.
    const moreEvents = Array.from({ length: 12 }, () => tfEvent(true));
    const { inputs: laterInputs, lastEventAt: laterAt } = runSequence(inputs, moreEvents, 1);
    const finalBand = classifyBand(laterInputs, laterAt);

    expect(laterInputs.weightedTotal).toBeGreaterThan(5);
    const finalLcb = wilsonLcb(laterInputs.weightedCorrect, laterInputs.weightedTotal);
    expect(finalLcb).toBeGreaterThanOrEqual(SOLID_AT_OR_ABOVE_LCB);
    expect(finalBand).toBe('solid');
  });
});

describe('acceptance: known-weak — repeated incorrect → weak', () => {
  it('classifies as weak once enough evidence accrues', () => {
    const events = Array.from({ length: 6 }, () => tfEvent(false));
    const { inputs, lastEventAt } = runSequence(EMPTY_INPUTS, events);
    expect(inputs.weightedTotal).toBeGreaterThanOrEqual(UNTESTED_BELOW_TOTAL);
    expect(classifyBand(inputs, lastEventAt)).toBe('weak');
  });
});

describe('acceptance: known-thin-evidence — 1-2 attempts → untested, never weak', () => {
  it('1 attempt stays untested', () => {
    const { inputs, lastEventAt } = runSequence(EMPTY_INPUTS, [tfEvent(false)]);
    expect(inputs.weightedTotal).toBeLessThan(UNTESTED_BELOW_TOTAL);
    expect(classifyBand(inputs, lastEventAt)).toBe('untested');
  });

  it('2 attempts (even both wrong) stays untested, not weak', () => {
    const { inputs, lastEventAt } = runSequence(EMPTY_INPUTS, [tfEvent(false), tfEvent(false)], 1);
    expect(inputs.weightedTotal).toBeLessThan(UNTESTED_BELOW_TOTAL);
    expect(classifyBand(inputs, lastEventAt)).toBe('untested');
    expect(classifyBand(inputs, lastEventAt)).not.toBe('weak');
  });
});

describe('acceptance: decay — stale evidence reads as less confident', () => {
  it('3 attempts 40 days ago yield a lower effective weightedTotal than 3 attempts last week', () => {
    // Free-input kind so each event contributes a full 1.0 to weightedTotal,
    // making the raw (undecayed) totals identical for both sequences.
    const freeInputCorrect = (): AttemptEvent => ({
      kind: 'fill_blank',
      isCorrect: true,
      usedHint: false,
      attemptNumber: 1,
      tagWeight: 1.0,
    });

    const events = [freeInputCorrect(), freeInputCorrect(), freeInputCorrect()];

    // Sequence A: all 3 events 40 days before "now".
    const startA = BASE;
    const { inputs: inputsA } = runSequence(EMPTY_INPUTS, events.map((e) => ({ ...e })), 1);
    const nowA = addDays(startA, 40 + events.length - 1 + 40); // last event + 40 more days
    const decayedA = decaySums(inputsA, inputsA.lastAttemptAt, nowA);

    // Sequence B: same 3 events, but "now" is only a few days after the last one.
    const { inputs: inputsB } = runSequence(EMPTY_INPUTS, events.map((e) => ({ ...e })), 1);
    const nowB = addDays(BASE, events.length - 1 + 3); // last event + 3 more days
    const decayedB = decaySums(inputsB, inputsB.lastAttemptAt, nowB);

    // Raw (undecayed) totals are identical — same 3 events.
    expect(inputsA.weightedTotal).toBeCloseTo(inputsB.weightedTotal);
    // But re-decayed to "now", the older sequence reads as less confident.
    expect(decayedA.weightedTotal).toBeLessThan(decayedB.weightedTotal);
  });
});

describe('acceptance: rusty', () => {
  it('a previously-solid concept, stale >21 days, with decayed lcb<0.65 reads as rusty', () => {
    // Build up a solid concept with many free-input correct answers.
    const events = Array.from({ length: 12 }, () => ({
      kind: 'fill_blank',
      isCorrect: true,
      usedHint: false,
      attemptNumber: 1,
      tagWeight: 1.0,
    } satisfies AttemptEvent));
    const { inputs, lastEventAt } = runSequence(EMPTY_INPUTS, events, 1);

    const lcbRightAfter = wilsonLcb(inputs.weightedCorrect, inputs.weightedTotal);
    expect(lcbRightAfter).toBeGreaterThanOrEqual(SOLID_AT_OR_ABOVE_LCB);
    expect(inputs.peakLcb).toBeGreaterThanOrEqual(SOLID_AT_OR_ABOVE_LCB);
    expect(classifyBand(inputs, lastEventAt)).toBe('solid');

    // Now jump far enough forward that both the 21-day staleness gate AND
    // the 14-day half-life decay push the re-decayed lcb below 0.65.
    const muchLater = addDays(lastEventAt, RUSTY_AFTER_DAYS + 30);
    expect(classifyBand(inputs, muchLater)).toBe('rusty');
  });

  it('a never-solid decayed concept does NOT become rusty', () => {
    // A concept that only ever reached `building`, never crossed the solid
    // threshold, so peakLcb < SOLID_AT_OR_ABOVE_LCB.
    const events = [tfEvent(true), tfEvent(true), tfEvent(false), tfEvent(true)];
    const { inputs, lastEventAt } = runSequence(EMPTY_INPUTS, events, 1);
    expect(inputs.peakLcb).toBeLessThan(SOLID_AT_OR_ABOVE_LCB);

    const muchLater = addDays(lastEventAt, RUSTY_AFTER_DAYS + 30);
    const band = classifyBand(inputs, muchLater);
    expect(band).not.toBe('rusty');
    // It should have decayed back toward untested (sums shrink toward 0).
    expect(band).toBe('untested');
  });
});

// ─── applyEvent bookkeeping ─────────────────────────────────────────────

describe('applyEvent', () => {
  it('bumps attemptCount, sets lastAttemptAt, and lastCorrectAt only on correct answers', () => {
    const afterWrong = applyEvent(EMPTY_INPUTS, tfEvent(false), BASE);
    expect(afterWrong.attemptCount).toBe(1);
    expect(afterWrong.lastAttemptAt).toEqual(BASE);
    expect(afterWrong.lastCorrectAt).toBeNull();

    const day2 = addDays(BASE, 1);
    const afterCorrect = applyEvent(afterWrong, tfEvent(true), day2);
    expect(afterCorrect.attemptCount).toBe(2);
    expect(afterCorrect.lastAttemptAt).toEqual(day2);
    expect(afterCorrect.lastCorrectAt).toEqual(day2);
  });

  it('peakLcb only ever increases, tracking the post-event lcb', () => {
    let inputs = EMPTY_INPUTS;
    let at = BASE;
    let maxSeenLcb = 0;
    for (let i = 0; i < 8; i++) {
      at = addDays(BASE, i);
      inputs = applyEvent(inputs, tfEvent(i % 3 !== 0), at);
      const lcbNow = wilsonLcb(inputs.weightedCorrect, inputs.weightedTotal);
      maxSeenLcb = Math.max(maxSeenLcb, lcbNow);
      expect(inputs.peakLcb).toBeCloseTo(maxSeenLcb);
      expect(inputs.peakLcb).toBeGreaterThanOrEqual(0);
    }
  });

  it('applies decay from lastAttemptAt before accruing the new event', () => {
    // First event today, second event 14 days later (one half-life).
    const first = applyEvent(EMPTY_INPUTS, tfEvent(true), BASE);
    const second = applyEvent(first, tfEvent(true), addDays(BASE, 14));
    // first.weightedTotal halves (0.5 -> 0.25) then + 0.5 new = 0.75
    expect(second.weightedTotal).toBeCloseTo(0.75);
  });
});

// ─── countDistinctCalendarDays ──────────────────────────────────────────

describe('countDistinctCalendarDays', () => {
  it('returns 0 for an empty list', () => {
    expect(countDistinctCalendarDays([])).toBe(0);
  });

  it('dedupes multiple timestamps on the same UTC day', () => {
    const morning = new Date('2026-03-10T01:00:00.000Z');
    const noon = new Date('2026-03-10T12:00:00.000Z');
    const night = new Date('2026-03-10T23:59:59.000Z');
    expect(countDistinctCalendarDays([morning, noon, night])).toBe(1);
  });

  it('counts timestamps just before and after UTC midnight as 2 distinct days', () => {
    const justBeforeMidnight = new Date('2026-03-10T23:59:59.999Z');
    const justAfterMidnight = new Date('2026-03-11T00:00:00.001Z');
    expect(countDistinctCalendarDays([justBeforeMidnight, justAfterMidnight])).toBe(2);
  });

  it('counts N distinct days regardless of input order or duplicates', () => {
    const day1 = new Date('2026-03-01T08:00:00.000Z');
    const day2a = new Date('2026-03-05T08:00:00.000Z');
    const day2b = new Date('2026-03-05T20:00:00.000Z');
    const day3 = new Date('2026-03-09T08:00:00.000Z');
    expect(countDistinctCalendarDays([day3, day1, day2a, day2b])).toBe(3);
  });
});

// ─── resolveGraduationBand (§2.4 graduation) ────────────────────────────

describe('resolveGraduationBand', () => {
  it('gates graduation: 2 correct answers on the SAME UTC day, prevStatus weak, stays strengthening', () => {
    // Plan acceptance criterion: "graduation cannot be triggered by 2
    // retries in one sitting" — even though lcb reads solid, only 1
    // distinct correct calendar day has been logged.
    const distinctCorrectDays = 1;
    const band = resolveGraduationBand('solid', 'weak', distinctCorrectDays);
    expect(band).toBe('strengthening');
  });

  it('graduates: correct answers on 2 SEPARATE UTC days, prevStatus strengthening, lcb>=solid → solid', () => {
    const distinctCorrectDays = 2;
    const band = resolveGraduationBand('solid', 'strengthening', distinctCorrectDays);
    expect(band).toBe('solid');
  });

  it('a concept that was never struggling (prevStatus building) reaches solid immediately, not gated', () => {
    const distinctCorrectDays = 1;
    const band = resolveGraduationBand('solid', 'building', distinctCorrectDays);
    expect(band).toBe('solid');
  });

  it('a concept with no prior status (null, e.g. first-ever row) is not gated either', () => {
    expect(resolveGraduationBand('solid', null, 1)).toBe('solid');
    expect(resolveGraduationBand('solid', 'untested', 1)).toBe('solid');
    expect(resolveGraduationBand('solid', 'solid', 1)).toBe('solid');
  });

  it('a rusty-recovering concept is gated exactly like weak/strengthening', () => {
    expect(resolveGraduationBand('solid', 'rusty', 1)).toBe('strengthening');
    expect(resolveGraduationBand('solid', 'rusty', GRADUATION_MIN_CORRECT_DAYS)).toBe('solid');
  });

  it('non-solid, non-building, non-untested base bands pass through unchanged regardless of days/prevStatus', () => {
    // NOTE: `resolveGraduationBand('untested', 'strengthening', 5)` used to
    // assert `'untested'` here (bare passthrough). That is the exact
    // second-order defect the sticky rule now also covers for `'untested'`
    // (see the "sticky strengthening through untested" describe block below)
    // — deliberately updated: `'strengthening'` prevStatus with an
    // `'untested'` baseBand must stay sticky, not erase the struggling
    // memory. `'weak'`/`'rusty'`/`'strengthening'` baseBands are unaffected
    // by either sticky rule and still pass through unchanged.
    expect(resolveGraduationBand('weak', 'weak', 0)).toBe('weak');
    expect(resolveGraduationBand('rusty', 'weak', 0)).toBe('rusty');
    expect(resolveGraduationBand('strengthening', 'weak', 1)).toBe('strengthening');
  });

  // NOTE: `resolveGraduationBand('building', 'weak', 1)` used to assert
  // `'building'` (bare passthrough). That is the exact defect this suite now
  // guards against — see the "sticky strengthening" describe block below:
  // a recovering concept must never be written back as bare `'building'`,
  // or the struggling memory (`wasStruggling`) is erased and the very next
  // same-day correct answer bypasses the distinct-calendar-days gate. The
  // corrected expectation (`'building'` + struggling `prevStatus` →
  // `'strengthening'`) is asserted below instead.

  it('exactly GRADUATION_MIN_CORRECT_DAYS days is enough; one fewer is not', () => {
    expect(resolveGraduationBand('solid', 'weak', GRADUATION_MIN_CORRECT_DAYS)).toBe('solid');
    expect(resolveGraduationBand('solid', 'weak', GRADUATION_MIN_CORRECT_DAYS - 1)).toBe(
      'strengthening'
    );
  });
});

// ─── resolveGraduationBand: sticky `strengthening` through `building` ───
//
// Regression coverage for the confirmed CRITICAL defect: `baseBand ===
// 'building'` used to pass through unchanged even when `prevStatus` was
// struggling. Because the write path persists this function's output as
// `ConceptMastery.status` on EVERY write (not just the final `solid` step),
// a same-day weak→building→solid climb would erase the "was struggling"
// memory the moment a bare `'building'` got written, letting the very next
// same-day correct answer skip the distinct-calendar-days gate entirely.
describe('resolveGraduationBand: sticky strengthening through building (regression)', () => {
  it('building + struggling prevStatus (weak/strengthening/rusty) is reported as strengthening, not building', () => {
    expect(resolveGraduationBand('building', 'weak', 1)).toBe('strengthening');
    expect(resolveGraduationBand('building', 'strengthening', 1)).toBe('strengthening');
    expect(resolveGraduationBand('building', 'rusty', 1)).toBe('strengthening');
  });

  it('building + non-struggling prevStatus passes through as bare building, unmolested', () => {
    expect(resolveGraduationBand('building', 'building', 1)).toBe('building');
    expect(resolveGraduationBand('building', 'untested', 1)).toBe('building');
    expect(resolveGraduationBand('building', null, 1)).toBe('building');
  });

  it('the sticky rule is insensitive to distinctCorrectDays — building is stickied on wasStruggling alone', () => {
    expect(resolveGraduationBand('building', 'weak', 0)).toBe('strengthening');
    expect(resolveGraduationBand('building', 'weak', GRADUATION_MIN_CORRECT_DAYS)).toBe(
      'strengthening'
    );
  });
});

// ─── resolveGraduationBand: sticky `strengthening` through `untested` ───
//
// Regression coverage for the CONFIRMED second-order defect: a concept's
// stored status can go stale (e.g. DB says 'weak' or 'solid'-now-actually-
// 'rusty' after a long dormancy). The first post-dormancy event's heavy
// decay can produce `baseBand === 'untested'` directly — skipping over
// `building` entirely — and since the original sticky rule only covered
// `'building'`, a bare `'untested'` passthrough erased the struggling
// memory just as effectively, letting a same-day burst of correct answers
// graduate ungated. The fix extends the sticky rule to `'untested'` too.
describe('resolveGraduationBand: sticky strengthening through untested (second-order regression)', () => {
  it("resolveGraduationBand('untested', 'weak', *) === 'strengthening'", () => {
    expect(resolveGraduationBand('untested', 'weak', 0)).toBe('strengthening');
    expect(resolveGraduationBand('untested', 'weak', 5)).toBe('strengthening');
  });

  it("resolveGraduationBand('untested', 'rusty', *) === 'strengthening'", () => {
    expect(resolveGraduationBand('untested', 'rusty', 0)).toBe('strengthening');
  });

  it("resolveGraduationBand('untested', 'strengthening', *) === 'strengthening'", () => {
    expect(resolveGraduationBand('untested', 'strengthening', 0)).toBe('strengthening');
  });

  it("resolveGraduationBand('untested', 'building', *) === 'untested' (non-struggling passes through)", () => {
    expect(resolveGraduationBand('untested', 'building', 0)).toBe('untested');
  });

  it("resolveGraduationBand('untested', null, *) === 'untested' (no prior status, not gated)", () => {
    expect(resolveGraduationBand('untested', null, 0)).toBe('untested');
  });
});

describe('isStrugglingStatus', () => {
  it('true for weak/strengthening/rusty', () => {
    expect(isStrugglingStatus('weak')).toBe(true);
    expect(isStrugglingStatus('strengthening')).toBe(true);
    expect(isStrugglingStatus('rusty')).toBe(true);
  });

  it('false for untested/building/solid/null/unknown', () => {
    expect(isStrugglingStatus('untested')).toBe(false);
    expect(isStrugglingStatus('building')).toBe(false);
    expect(isStrugglingStatus('solid')).toBe(false);
    expect(isStrugglingStatus(null)).toBe(false);
    expect(isStrugglingStatus('some-unknown-status')).toBe(false);
  });
});

describe('regression: same-day weak→building→solid climb cannot bypass the graduation gate', () => {
  /** Simulates the write path's status chaining at the pure level: each
   *  step computes `baseBand` from real accumulated `applyEvent` state (via
   *  `classifyBand`), then feeds it through `resolveGraduationBand` together
   *  with the CHAINED `prevStatus` (last write's persisted output) and the
   *  running set of correct-answer dates — exactly what
   *  `concept-write.ts::recordConceptAttempt` does across a sequence of
   *  writes for the same concept. */
  function simulateWritePathChain(
    startStatus: string | null,
    events: AttemptEvent[],
    dates: Date[]
  ): { statuses: string[]; masteryHistory: MasteryInputs[] } {
    let prevStatus = startStatus;
    let inputs = EMPTY_INPUTS;
    const correctDatesSoFar: Date[] = [];
    const statuses: string[] = [];
    const masteryHistory: MasteryInputs[] = [];

    for (let i = 0; i < events.length; i++) {
      const eventAt = dates[i];
      inputs = applyEvent(inputs, events[i], eventAt);
      if (events[i].isCorrect) correctDatesSoFar.push(eventAt);

      const baseBand = classifyBand(inputs, eventAt);
      const distinctCorrectDays = countDistinctCalendarDays(correctDatesSoFar);
      const gradBand = resolveGraduationBand(baseBand, prevStatus, distinctCorrectDays);

      statuses.push(gradBand);
      masteryHistory.push(inputs);
      prevStatus = gradBand; // write path persists gradBand as ConceptMastery.status
    }

    return { statuses, masteryHistory };
  }

  it('a realistic same-day weak→building→solid climb (driven by applyEvent+classifyBand) never persists solid on one UTC day — it lands on strengthening; a 2nd-day correct answer then graduates it', () => {
    // Seed a genuinely `weak` concept: several same-day incorrect answers.
    const seedWrongEvents = Array.from({ length: 6 }, () => tfEvent(false));
    const seedDates = seedWrongEvents.map(() => BASE); // all same UTC day
    const seeded = simulateWritePathChain(null, seedWrongEvents, seedDates);
    expect(seeded.statuses[seeded.statuses.length - 1]).toBe('weak');
    const seededInputs = seeded.masteryHistory[seeded.masteryHistory.length - 1];
    expect(classifyBand(seededInputs, BASE)).toBe('weak');

    // Now climb out of `weak` with a same-day burst of correct answers,
    // chaining prevStatus write-to-write exactly like recordConceptAttempt.
    let prevStatus = seeded.statuses[seeded.statuses.length - 1]; // 'weak'
    let inputs = seededInputs;
    const correctDatesSoFar: Date[] = [];
    const sameDay = BASE; // every event below lands on this one UTC day
    const climbStatuses: string[] = [];

    // 45 same-day correct true_false answers: enough reps for the Wilson lcb
    // (conservative at z=1.0, and evidence-discounted at 0.5/event for a
    // guessable T/F question) to genuinely clear SOLID_AT_OR_ABOVE_LCB despite
    // the 6-wrong seed still in the decayed sums — see the finalLcb assertion
    // below, which fails loudly (vacuous-test guard) if this ever undershoots.
    for (let i = 0; i < 45; i++) {
      inputs = applyEvent(inputs, tfEvent(true), sameDay);
      correctDatesSoFar.push(sameDay);

      const baseBand = classifyBand(inputs, sameDay);
      const distinctCorrectDays = countDistinctCalendarDays(correctDatesSoFar);
      const gradBand = resolveGraduationBand(baseBand, prevStatus, distinctCorrectDays);

      climbStatuses.push(gradBand);
      prevStatus = gradBand;

      // THE ASSERTION THAT MATTERS: as long as every correct answer so far
      // shares one UTC calendar day, the persisted status must never reach
      // 'solid' — no matter how high the lcb climbs from repeated same-day
      // correct answers.
      expect(gradBand).not.toBe('solid');
    }

    // The climb must actually have reached a point where the RAW band
    // (pre-gate) would have read 'solid' — otherwise this test would pass
    // vacuously without ever exercising the gate.
    const finalLcb = wilsonLcb(inputs.weightedCorrect, inputs.weightedTotal);
    expect(finalLcb).toBeGreaterThanOrEqual(SOLID_AT_OR_ABOVE_LCB);
    expect(classifyBand(inputs, sameDay)).toBe('solid'); // raw band says solid...
    expect(climbStatuses[climbStatuses.length - 1]).toBe('strengthening'); // ...but gated status doesn't.
    expect(prevStatus).toBe('strengthening');

    // Now a correct answer on a SECOND distinct UTC day: the gate must open.
    const secondDay = addDays(sameDay, 1);
    inputs = applyEvent(inputs, tfEvent(true), secondDay);
    correctDatesSoFar.push(secondDay);
    const baseBandDay2 = classifyBand(inputs, secondDay);
    const distinctCorrectDaysDay2 = countDistinctCalendarDays(correctDatesSoFar);
    expect(distinctCorrectDaysDay2).toBe(2);
    const gradBandDay2 = resolveGraduationBand(baseBandDay2, prevStatus, distinctCorrectDaysDay2);

    expect(baseBandDay2).toBe('solid');
    expect(gradBandDay2).toBe('solid');
  });

  it('control: a never-struggled concept (prevStatus starts null/untested) climbs to solid same-day, unblocked, passing through building unmolested', () => {
    let prevStatus: string | null = null;
    let inputs = EMPTY_INPUTS;
    const correctDatesSoFar: Date[] = [];
    const sameDay = BASE;
    const statuses: string[] = [];
    const baseBands: MasteryBand[] = [];

    for (let i = 0; i < 20; i++) {
      inputs = applyEvent(inputs, tfEvent(true), sameDay);
      correctDatesSoFar.push(sameDay);

      const baseBand = classifyBand(inputs, sameDay);
      const distinctCorrectDays = countDistinctCalendarDays(correctDatesSoFar);
      const gradBand = resolveGraduationBand(baseBand, prevStatus, distinctCorrectDays);

      baseBands.push(baseBand);
      statuses.push(gradBand);
      prevStatus = gradBand;
    }

    // It does pass through a `building` reading at some point on the way up...
    expect(baseBands).toContain('building');
    // ...and since it was never struggling, resolveGraduationBand does not
    // sticky it to strengthening — the never-struggled climb's gradBand
    // equals its baseBand at every step.
    for (let i = 0; i < baseBands.length; i++) {
      expect(statuses[i]).toBe(baseBands[i]);
    }
    // And it graduates to solid the same day — never-struggled concepts are
    // not gated by §2.4 at all.
    expect(statuses[statuses.length - 1]).toBe('solid');
    expect(classifyBand(inputs, sameDay)).toBe('solid');
  });
});

// ─── Full write-path simulation (concept-write.ts semantics) ───────────
//
// Regression coverage for the CONFIRMED second-order defect described in
// the plan: `concept-write.ts::recordConceptAttempt` never re-derives
// `prevStatus` from the stored `ConceptMastery.status` cache, and used to
// compute `distinctCorrectDays` from ALL-TIME correct events. This section
// simulates the REAL write-path chaining at the pure level — status_out(n)
// feeds prevStatus(n+1), exactly like the DB round-trip — including the
// `gatePrevStatus` re-derivation and the bounded (since-last-incorrect)
// distinct-days window, so these tests fail if either fix regresses.
describe('write-path simulation: gatePrevStatus + bounded distinct-days window (concept-write.ts semantics)', () => {
  interface SimEvent {
    event: AttemptEvent;
    at: Date;
  }

  interface SimStepResult {
    gradBand: MasteryBand;
    baseBand: MasteryBand;
    gatePrevStatus: string | null;
    distinctCorrectDays: number;
  }

  /** Real `ConceptAttemptEvent` rows always carry distinct wall-clock
   *  `createdAt` timestamps, even for events on the same UTC calendar day
   *  (each is a separate DB insert) — the `createdAt: { gt: ... } ` cutoff
   *  in `concept-write.ts` relies on that strict ordering to tell "before
   *  vs. after the last failure" apart. Tests that fire several same-UTC-day
   *  events (e.g. a wrong answer then a burst of corrects "later that day")
   *  must give each one a distinct, increasing instant — reusing one `Date`
   *  object for all of them would make the DB's strict `gt` comparison see
   *  them as simultaneous-with (not after) the failure, which is a test
   *  artifact, not real behavior. This helper adds a small per-event offset
   *  while staying within the same UTC calendar day. */
  function sameDayInstant(day: Date, sequenceIndex: number): Date {
    return new Date(day.getTime() + sequenceIndex * 1000); // +1s per event, well within one UTC day
  }

  /** Pure re-implementation of `recordConceptAttempt`'s per-event logic,
   *  chained across calls exactly like the DB round-trip: `storedStatus`
   *  persists as `gradBand` after each step and becomes the RAW prevStatus
   *  next step (never `gatePrevStatus`), mirroring the documented contract
   *  that `RecordConceptAttemptResult.prevStatus` must stay the raw stored
   *  cache. History accumulates all events so far (this step's event
   *  included, matching "step 1 inserts before the gate queries run"). */
  function simulateRecordConceptAttempt(
    priorHistory: SimEvent[],
    hasRow: boolean,
    mastery: MasteryInputs,
    storedStatus: string | null,
    step: SimEvent
  ): { result: SimStepResult; nextMastery: MasteryInputs; nextStoredStatus: string | null; nextHistory: SimEvent[] } {
    const rederivedBand = hasRow ? classifyBand(mastery, step.at) : null;
    const gatePrevStatus = isStrugglingStatus(storedStatus)
      ? storedStatus
      : isStrugglingStatus(rederivedBand)
        ? rederivedBand
        : storedStatus;

    const nextMastery = applyEvent(mastery, step.event, step.at);
    const baseBand = classifyBand(nextMastery, step.at);

    const history = [...priorHistory, step];
    const lastIncorrect = [...history]
      .reverse()
      .find((h) => !h.event.isCorrect);
    const correctDates = history
      .filter((h) => h.event.isCorrect && (!lastIncorrect || h.at.getTime() > lastIncorrect.at.getTime()))
      .map((h) => h.at);
    const distinctCorrectDays = countDistinctCalendarDays(correctDates);

    const gradBand = resolveGraduationBand(baseBand, gatePrevStatus, distinctCorrectDays);

    return {
      result: { gradBand, baseBand, gatePrevStatus, distinctCorrectDays },
      nextMastery,
      nextStoredStatus: gradBand,
      nextHistory: history,
    };
  }

  it('weak-then-dormant regression: a concept that reached weak on day 1, then 60 days silent, cannot graduate to solid on the day-61 same-day burst — lands strengthening; a further day-62 correct then reaches solid', () => {
    // Day 1: enough wrong T/F answers to become genuinely `weak`.
    let mastery = EMPTY_INPUTS;
    let storedStatus: string | null = null;
    let history: SimEvent[] = [];
    let hasRow = false;

    for (let i = 0; i < 6; i++) {
      const step: SimEvent = { event: tfEvent(false), at: BASE };
      const r = simulateRecordConceptAttempt(history, hasRow, mastery, storedStatus, step);
      mastery = r.nextMastery;
      storedStatus = r.nextStoredStatus;
      history = r.nextHistory;
      hasRow = true;
    }
    expect(storedStatus).toBe('weak');
    expect(classifyBand(mastery, BASE)).toBe('weak');

    // 60-day gap, then a same-day burst of correct answers on day 61.
    const day61 = addDays(BASE, 60);
    const burstStatuses: string[] = [];
    for (let i = 0; i < 20; i++) {
      const step: SimEvent = { event: tfEvent(true), at: day61 };
      const r = simulateRecordConceptAttempt(history, hasRow, mastery, storedStatus, step);
      mastery = r.nextMastery;
      storedStatus = r.nextStoredStatus;
      history = r.nextHistory;
      burstStatuses.push(r.nextStoredStatus!);
    }

    // The raw band must actually have climbed enough to be interesting
    // (otherwise this test is vacuous) — confirm it passed through
    // untested/building on the way, and never persisted 'solid' that day.
    expect(burstStatuses).not.toContain('solid');
    expect(storedStatus).toBe('strengthening');

    // A further correct answer on day 62 (2nd distinct calendar day since
    // the day-61 recovery began — day 1's wrongs are outside the window
    // because a wrong answer never occurred after day 1) graduates it.
    const day62 = addDays(BASE, 61);
    const finalStep: SimEvent = { event: tfEvent(true), at: day62 };
    const finalResult = simulateRecordConceptAttempt(history, hasRow, mastery, storedStatus, finalStep);
    expect(finalResult.result.gradBand).toBe('solid');
  });

  it('stale-solid → rusty comeback with a CLEAN history (zero incorrect events): documented-accepted immediate solid on the comeback day', () => {
    // Build genuinely solid across >=2 distinct days, zero incorrect events.
    let mastery = EMPTY_INPUTS;
    let storedStatus: string | null = null;
    let history: SimEvent[] = [];
    let hasRow = false;

    const buildEvents = Array.from({ length: 12 }, () => ({
      kind: 'fill_blank',
      isCorrect: true,
      usedHint: false,
      attemptNumber: 1,
      tagWeight: 1.0,
    } satisfies AttemptEvent));

    for (let i = 0; i < buildEvents.length; i++) {
      const at = addDays(BASE, i);
      const step: SimEvent = { event: buildEvents[i], at };
      const r = simulateRecordConceptAttempt(history, hasRow, mastery, storedStatus, step);
      mastery = r.nextMastery;
      storedStatus = r.nextStoredStatus;
      history = r.nextHistory;
      hasRow = true;
    }
    expect(storedStatus).toBe('solid');
    expect(mastery.peakLcb).toBeGreaterThanOrEqual(SOLID_AT_OR_ABOVE_LCB);

    // 60-day dormancy — long enough that classifyBand would now read 'rusty'
    // (peakLcb was solid, staleness > RUSTY_AFTER_DAYS, decayed lcb drops
    // below RUSTY_BELOW_LCB) even though the stored cache still says 'solid'.
    const lastBuildAt = addDays(BASE, buildEvents.length - 1);
    const comebackDay = addDays(lastBuildAt, 60);
    expect(classifyBand(mastery, comebackDay)).toBe('rusty');

    // Same-day comeback burst of correct answers.
    const burstStatuses: string[] = [];
    for (let i = 0; i < 10; i++) {
      const step: SimEvent = { event: tfEvent(true), at: comebackDay };
      const r = simulateRecordConceptAttempt(history, hasRow, mastery, storedStatus, step);
      mastery = r.nextMastery;
      storedStatus = r.nextStoredStatus;
      history = r.nextHistory;
      burstStatuses.push(r.nextStoredStatus!);
    }

    // Documented-accepted behavior (§2.4 scope: weak/strengthening recovery,
    // not rusty-with-clean-history): with zero incorrect events ever, the
    // distinct-correct-days window is unbounded (no lastIncorrect cutoff),
    // so the historical multi-day solid evidence satisfies the >=2-day gate
    // and the comeback reconfirms 'solid' the same day.
    expect(storedStatus).toBe('solid');
  });

  it('stale-solid → rusty comeback WITH a failure: the first comeback answer being wrong resets the window, so same-day corrects after it do NOT reach solid — lands strengthening; a next-day correct then reaches solid', () => {
    let mastery = EMPTY_INPUTS;
    let storedStatus: string | null = null;
    let history: SimEvent[] = [];
    let hasRow = false;

    const buildEvents = Array.from({ length: 12 }, () => ({
      kind: 'fill_blank',
      isCorrect: true,
      usedHint: false,
      attemptNumber: 1,
      tagWeight: 1.0,
    } satisfies AttemptEvent));

    for (let i = 0; i < buildEvents.length; i++) {
      const at = addDays(BASE, i);
      const step: SimEvent = { event: buildEvents[i], at };
      const r = simulateRecordConceptAttempt(history, hasRow, mastery, storedStatus, step);
      mastery = r.nextMastery;
      storedStatus = r.nextStoredStatus;
      history = r.nextHistory;
      hasRow = true;
    }
    expect(storedStatus).toBe('solid');

    const lastBuildAt = addDays(BASE, buildEvents.length - 1);
    const comebackDay = addDays(lastBuildAt, 60);
    expect(classifyBand(mastery, comebackDay)).toBe('rusty');

    // First comeback answer is WRONG — resets the distinct-correct-days
    // window from this point forward.
    const wrongStep: SimEvent = { event: tfEvent(false), at: sameDayInstant(comebackDay, 0) };
    const wrongResult = simulateRecordConceptAttempt(history, hasRow, mastery, storedStatus, wrongStep);
    mastery = wrongResult.nextMastery;
    storedStatus = wrongResult.nextStoredStatus;
    history = wrongResult.nextHistory;

    // Now a same-day burst of correct answers (each a distinct, later
    // instant that UTC calendar day — see `sameDayInstant`) — must NOT
    // reach solid; the window was just reset by the wrong answer above, so
    // at most 1 distinct correct day is available today.
    const burstStatuses: string[] = [];
    for (let i = 0; i < 15; i++) {
      const step: SimEvent = { event: tfEvent(true), at: sameDayInstant(comebackDay, i + 1) };
      const r = simulateRecordConceptAttempt(history, hasRow, mastery, storedStatus, step);
      mastery = r.nextMastery;
      storedStatus = r.nextStoredStatus;
      history = r.nextHistory;
      burstStatuses.push(r.nextStoredStatus!);
    }
    expect(burstStatuses).not.toContain('solid');
    expect(storedStatus).toBe('strengthening');

    // A correct answer on the NEXT distinct calendar day graduates it.
    const nextDay = addDays(comebackDay, 1);
    const finalStep: SimEvent = { event: tfEvent(true), at: nextDay };
    const finalResult = simulateRecordConceptAttempt(history, hasRow, mastery, storedStatus, finalStep);
    expect(finalResult.result.gradBand).toBe('solid');
  });

  it('fail-on-purpose gaming: a weak concept answered wrong once then correctly N times on the SAME day never reaches solid that day', () => {
    // Seed genuinely weak.
    let mastery = EMPTY_INPUTS;
    let storedStatus: string | null = null;
    let history: SimEvent[] = [];
    let hasRow = false;

    for (let i = 0; i < 6; i++) {
      const step: SimEvent = { event: tfEvent(false), at: BASE };
      const r = simulateRecordConceptAttempt(history, hasRow, mastery, storedStatus, step);
      mastery = r.nextMastery;
      storedStatus = r.nextStoredStatus;
      history = r.nextHistory;
      hasRow = true;
    }
    expect(storedStatus).toBe('weak');

    // Later same day: deliberately answer wrong once (gaming attempt to
    // "reset" something in the attacker's favor), then spam correct answers.
    const gameDay = addDays(BASE, 5);
    const wrongStep: SimEvent = { event: tfEvent(false), at: sameDayInstant(gameDay, 0) };
    const wrongResult = simulateRecordConceptAttempt(history, hasRow, mastery, storedStatus, wrongStep);
    mastery = wrongResult.nextMastery;
    storedStatus = wrongResult.nextStoredStatus;
    history = wrongResult.nextHistory;

    const burstStatuses: string[] = [];
    for (let i = 0; i < 20; i++) {
      const step: SimEvent = { event: tfEvent(true), at: sameDayInstant(gameDay, i + 1) };
      const r = simulateRecordConceptAttempt(history, hasRow, mastery, storedStatus, step);
      mastery = r.nextMastery;
      storedStatus = r.nextStoredStatus;
      history = r.nextHistory;
      burstStatuses.push(r.nextStoredStatus!);
    }

    expect(burstStatuses).not.toContain('solid');
  });
});

// ─── sourceWeight (Phase 4.3, plan §13.2) ───────────────────────────────
//
// Additive coverage only — every test above this point runs unmodified and
// must still pass, proving omitting `sourceWeight` is byte-for-byte
// identical to pre-4.3 behavior (it defaults to SOURCE_WEIGHT_GRADED = 1.0).

describe('sourceWeight: default is a zero-behavior-change no-op', () => {
  it('omitting sourceWeight produces the exact same delta as explicitly passing 1.0', () => {
    const omitted = computeEventDelta(tfEvent(true));
    const explicit = computeEventDelta(tfEvent(true, { sourceWeight: SOURCE_WEIGHT_GRADED }));
    expect(omitted.eventCorrect).toBeCloseTo(explicit.eventCorrect);
    expect(omitted.eventTotal).toBeCloseTo(explicit.eventTotal);
  });

  it('SOURCE_WEIGHT_GRADED is 1.0', () => {
    expect(SOURCE_WEIGHT_GRADED).toBe(1.0);
  });
});

describe('sourceWeight: flashcard self-grade discount multiplies into both sums', () => {
  it('SOURCE_WEIGHT_FLASHCARD_SELF_GRADE is 0.35', () => {
    expect(SOURCE_WEIGHT_FLASHCARD_SELF_GRADE).toBe(0.35);
  });

  it('multiplies eventTotal and eventCorrect symmetrically, same as tagWeight', () => {
    const full = computeEventDelta({
      kind: 'flashcard_review',
      isCorrect: true,
      usedHint: false,
      attemptNumber: 1,
      tagWeight: 1.0,
    });
    const discounted = computeEventDelta({
      kind: 'flashcard_review',
      isCorrect: true,
      usedHint: false,
      attemptNumber: 1,
      tagWeight: 1.0,
      sourceWeight: SOURCE_WEIGHT_FLASHCARD_SELF_GRADE,
    });
    expect(discounted.eventTotal).toBeCloseTo(full.eventTotal * SOURCE_WEIGHT_FLASHCARD_SELF_GRADE);
    expect(discounted.eventCorrect).toBeCloseTo(full.eventCorrect * SOURCE_WEIGHT_FLASHCARD_SELF_GRADE);
  });

  it('incorrect flashcard events still yield eventCorrect=0 but accrue discounted eventTotal', () => {
    const wrong = computeEventDelta({
      kind: 'flashcard_review',
      isCorrect: false,
      usedHint: false,
      attemptNumber: 1,
      tagWeight: 1.0,
      sourceWeight: SOURCE_WEIGHT_FLASHCARD_SELF_GRADE,
    });
    expect(wrong.eventCorrect).toBe(0);
    expect(wrong.eventTotal).toBeCloseTo(1.0 * 1.0 * SOURCE_WEIGHT_FLASHCARD_SELF_GRADE);
  });

  it('combines multiplicatively with tagWeight for a secondary-concept flashcard tag', () => {
    const primary = computeEventDelta({
      kind: 'flashcard_review',
      isCorrect: true,
      usedHint: false,
      attemptNumber: 1,
      tagWeight: 1.0,
      sourceWeight: SOURCE_WEIGHT_FLASHCARD_SELF_GRADE,
    });
    const secondary = computeEventDelta({
      kind: 'flashcard_review',
      isCorrect: true,
      usedHint: false,
      attemptNumber: 1,
      tagWeight: 0.5,
      sourceWeight: SOURCE_WEIGHT_FLASHCARD_SELF_GRADE,
    });
    expect(secondary.eventTotal).toBeCloseTo(primary.eventTotal / 2);
    expect(secondary.eventCorrect).toBeCloseTo(primary.eventCorrect / 2);
  });
});

describe('sourceWeight: §13.2 worked example — 5 "Good" self-grades stay untested, ~8 crosses', () => {
  function flashcardGoodEvent(): AttemptEvent {
    return {
      kind: 'flashcard_review',
      isCorrect: true,
      usedHint: false,
      attemptNumber: 1,
      tagWeight: 1.0,
      sourceWeight: SOURCE_WEIGHT_FLASHCARD_SELF_GRADE,
    };
  }

  it('5 "Good" self-grades alone accrue weightedTotal = 1.75, still under the 2.5 confidence gate', () => {
    const events = Array.from({ length: 5 }, () => flashcardGoodEvent());
    // Same-day spacing so inter-event decay doesn't eat into the count —
    // matches the plan's stated arithmetic (5 * 0.35 = 1.75) exactly.
    const { inputs, lastEventAt } = runSequence(EMPTY_INPUTS, events, 0);

    expect(inputs.weightedTotal).toBeCloseTo(1.75);
    expect(inputs.weightedTotal).toBeLessThan(UNTESTED_BELOW_TOTAL);
    expect(classifyBand(inputs, lastEventAt)).toBe('untested');
  });

  it('~8 "Good" self-grades cross the 2.5 confidence gate out of untested', () => {
    const events = Array.from({ length: 8 }, () => flashcardGoodEvent());
    const { inputs, lastEventAt } = runSequence(EMPTY_INPUTS, events, 0);

    // 8 * 0.35 = 2.8, clears the 2.5 gate.
    expect(inputs.weightedTotal).toBeGreaterThanOrEqual(UNTESTED_BELOW_TOTAL);
    expect(classifyBand(inputs, lastEventAt)).not.toBe('untested');
  });

  it('flashcard-only evidence never certifies mastery on its own as fast as MC/free-input evidence would', () => {
    const flashcardEvents = Array.from({ length: 5 }, () => flashcardGoodEvent());
    const { inputs: flashcardInputs } = runSequence(EMPTY_INPUTS, flashcardEvents, 0);

    const mcEvents = Array.from({ length: 5 }, () => ({
      kind: 'mc',
      isCorrect: true,
      usedHint: false,
      attemptNumber: 1,
      tagWeight: 1.0,
    } satisfies AttemptEvent));
    const { inputs: mcInputs } = runSequence(EMPTY_INPUTS, mcEvents, 0);

    expect(flashcardInputs.weightedTotal).toBeLessThan(mcInputs.weightedTotal);
  });
});
