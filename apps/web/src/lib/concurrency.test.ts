import { describe, it, expect } from 'vitest';
import { createSemaphore } from './concurrency';

describe('createSemaphore', () => {
  it('never runs more than `limit` tasks at once and completes all of them', async () => {
    const sem = createSemaphore(3);
    let active = 0;
    let peak = 0;
    const run = (i: number) =>
      sem.run(async () => {
        active += 1;
        peak = Math.max(peak, active);
        // Yield a few microtasks so overlap is possible if the limit weren't enforced.
        await Promise.resolve();
        await Promise.resolve();
        active -= 1;
        return i;
      });

    const results = await Promise.all(Array.from({ length: 12 }, (_, i) => run(i)));

    expect(peak).toBeLessThanOrEqual(3);
    expect(results).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it('limit=1 serializes execution (peak concurrency 1)', async () => {
    const sem = createSemaphore(1);
    let active = 0;
    let peak = 0;
    await Promise.all(
      Array.from({ length: 5 }, () =>
        sem.run(async () => {
          active += 1;
          peak = Math.max(peak, active);
          await Promise.resolve();
          active -= 1;
        }),
      ),
    );
    expect(peak).toBe(1);
  });

  it('releases the slot even when a task throws, so later tasks still run', async () => {
    const sem = createSemaphore(1);
    await expect(
      sem.run(async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    // If the slot leaked, this would deadlock (test would time out).
    const ok = await sem.run(async () => 'ok');
    expect(ok).toBe('ok');
  });
});
