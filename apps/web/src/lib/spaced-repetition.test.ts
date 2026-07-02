import { describe, it, expect } from 'vitest';
import { sm2, sm2Lite, LEECH_THRESHOLD, MAX_INTERVAL_DAYS } from './spaced-repetition';

// ─── sm2Lite: interval ladder ───────────────────────────────────────────

describe('sm2Lite: interval ladder', () => {
  it('first correct answer (repetitions 0 -> 1) uses interval 1', () => {
    const result = sm2Lite(4, 2.5, 0, 0, 0);
    expect(result.repetitions).toBe(1);
    expect(result.interval).toBe(1);
  });

  it('second correct answer (repetitions 1 -> 2) uses interval 6', () => {
    const result = sm2Lite(4, 2.5, 1, 1, 0);
    expect(result.repetitions).toBe(2);
    expect(result.interval).toBe(6);
  });

  it('third+ correct answer rounds previousInterval * ef', () => {
    const result = sm2Lite(4, 2.5, 6, 2, 0);
    expect(result.repetitions).toBe(3);
    expect(result.interval).toBe(Math.round(6 * result.easeFactor));
  });

  it('matches sm2()\'s ladder/EF math exactly (sm2Lite is additive, not a reimplementation)', () => {
    const base = sm2(4, 2.5, 6, 2);
    const lite = sm2Lite(4, 2.5, 6, 2, 0);
    expect(lite.easeFactor).toBeCloseTo(base.easeFactor);
    expect(lite.repetitions).toBe(base.repetitions);
    expect(lite.interval).toBe(base.interval);
  });
});

// ─── EF floor ───────────────────────────────────────────────────────────

describe('sm2Lite: EF floor', () => {
  it('ease factor never drops below 1.3 even after repeated Again grades', () => {
    let ef = 2.5;
    let interval = 0;
    let repetitions = 0;
    let lapses = 0;
    for (let i = 0; i < 10; i++) {
      const result = sm2Lite(0, ef, interval, repetitions, lapses);
      ef = result.easeFactor;
      interval = result.interval;
      repetitions = result.repetitions;
      lapses = result.lapses;
      expect(ef).toBeGreaterThanOrEqual(1.3);
    }
    expect(ef).toBeCloseTo(1.3);
  });
});

// ─── MAX_INTERVAL_DAYS cap ────────────────────────────────────────────

describe('sm2Lite: MAX_INTERVAL_DAYS cap', () => {
  it('caps a runaway interval at MAX_INTERVAL_DAYS', () => {
    // A huge previousInterval * high EF would blow past 180 without the cap.
    const result = sm2Lite(5, 2.9, 500, 10, 0);
    expect(result.interval).toBe(MAX_INTERVAL_DAYS);
  });

  it('does not cap intervals below the max', () => {
    const result = sm2Lite(4, 2.5, 6, 2, 0);
    expect(result.interval).toBeLessThan(MAX_INTERVAL_DAYS);
  });

  it('nextReviewAt reflects the capped interval, not the uncapped one', () => {
    const result = sm2Lite(5, 2.9, 500, 10, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expected = new Date(today);
    expected.setDate(expected.getDate() + MAX_INTERVAL_DAYS);
    expect(result.nextReviewAt.getTime()).toBe(expected.getTime());
  });
});

// ─── Leech threshold ────────────────────────────────────────────────────

describe('sm2Lite: leech tracking', () => {
  it('"Again" from repetitions 0 is NOT a lapse (first exposure, not a lapse)', () => {
    const result = sm2Lite(0, 2.5, 0, 0, 0);
    expect(result.lapses).toBe(0);
    expect(result.isLeech).toBe(false);
  });

  it('"Again" from repetitions 1 is NOT a lapse (still early learning steps)', () => {
    const result = sm2Lite(0, 2.5, 1, 1, 0);
    expect(result.lapses).toBe(0);
    expect(result.isLeech).toBe(false);
  });

  it('"Again" from repetitions >= 2 IS a lapse (card had matured past learning steps)', () => {
    const result = sm2Lite(0, 2.5, 6, 2, 0);
    expect(result.lapses).toBe(1);
  });

  it('"Hard" (quality 3) never counts as a lapse, regardless of repetitions', () => {
    const result = sm2Lite(3, 2.5, 6, 3, 2);
    expect(result.lapses).toBe(2);
  });

  it('crosses LEECH_THRESHOLD and flags isLeech; stays flagged (never un-leeches)', () => {
    let ef = 2.5;
    let interval = 6;
    let repetitions = 3;
    let lapses = LEECH_THRESHOLD - 1;

    const result = sm2Lite(0, ef, interval, repetitions, lapses);
    expect(result.lapses).toBe(LEECH_THRESHOLD);
    expect(result.isLeech).toBe(true);

    // A subsequent correct answer never removes the leech flag by resetting
    // lapses — lapses is monotonic (only ever incremented), so isLeech stays
    // true even once repetitions climbs back up.
    ef = result.easeFactor;
    interval = result.interval;
    repetitions = result.repetitions;
    lapses = result.lapses;
    const next = sm2Lite(4, ef, interval, repetitions, lapses);
    expect(next.lapses).toBe(LEECH_THRESHOLD);
    expect(next.isLeech).toBe(true);
  });

  it('below LEECH_THRESHOLD reads isLeech=false', () => {
    const result = sm2Lite(0, 2.5, 6, 2, LEECH_THRESHOLD - 2);
    expect(result.lapses).toBe(LEECH_THRESHOLD - 1);
    expect(result.isLeech).toBe(false);
  });
});

// ─── Quality-domain mapping (0|3|4|5 — Again/Hard/Good/Easy) ────────────

describe('sm2Lite: quality-domain mapping', () => {
  it('Again (0) resets repetitions and interval to 1, regardless of prior state', () => {
    const result = sm2Lite(0, 2.5, 30, 5, 0);
    expect(result.repetitions).toBe(0);
    expect(result.interval).toBe(1);
  });

  it('Hard (3) counts as correct and advances the ladder', () => {
    const result = sm2Lite(3, 2.5, 0, 0, 0);
    expect(result.repetitions).toBe(1);
    expect(result.interval).toBe(1);
  });

  it('Good (4) and Easy (5) both count as correct and advance the ladder identically in shape', () => {
    const good = sm2Lite(4, 2.5, 1, 1, 0);
    const easy = sm2Lite(5, 2.5, 1, 1, 0);
    expect(good.repetitions).toBe(2);
    expect(easy.repetitions).toBe(2);
    expect(good.interval).toBe(6);
    expect(easy.interval).toBe(6);
    // Easy grants a strictly larger ease-factor bump than Good.
    expect(easy.easeFactor).toBeGreaterThan(good.easeFactor);
  });

  it('Hard yields a smaller ease-factor bump than Good (quality 3 < 4 in the EF formula)', () => {
    const hard = sm2Lite(3, 2.5, 1, 1, 0);
    const good = sm2Lite(4, 2.5, 1, 1, 0);
    expect(hard.easeFactor).toBeLessThan(good.easeFactor);
  });
});
