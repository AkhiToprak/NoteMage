import { describe, it, expect } from 'vitest';
import { countdownBucket } from './exam-reminders';

/**
 * The countdown-bucket rule is the load-bearing anti-spam logic: as an exam
 * approaches, each of [7, 3, 1, 0] fires at most once, and a late-created exam
 * never dumps every past bucket at once — it fires the SMALLEST bucket it has
 * already reached, then the next as days tick down.
 */
describe('countdownBucket', () => {
  it('returns null while the exam is further out than the largest bucket', () => {
    expect(countdownBucket(8)).toBeNull();
    expect(countdownBucket(30)).toBeNull();
  });

  it('fires the 7-bucket only in the 7..4-day window', () => {
    expect(countdownBucket(7)).toBe(7);
    expect(countdownBucket(6)).toBe(7);
    expect(countdownBucket(5)).toBe(7);
    expect(countdownBucket(4)).toBe(7);
  });

  it('narrows to the smallest reached bucket as the exam approaches', () => {
    expect(countdownBucket(3)).toBe(3);
    expect(countdownBucket(2)).toBe(3); // still in the 3-bucket window
    expect(countdownBucket(1)).toBe(1);
    expect(countdownBucket(0)).toBe(0);
  });

  it('handles a late-created exam (2 days out → bucket 3, not 7)', () => {
    // A learner who adds an exam 2 days before it should get the most relevant
    // single reminder (bucket 3), then bucket 1, then bucket 0 — never bucket 7.
    expect(countdownBucket(2)).toBe(3);
  });

  it('treats a same-day exam as bucket 0', () => {
    expect(countdownBucket(0)).toBe(0);
  });
});
