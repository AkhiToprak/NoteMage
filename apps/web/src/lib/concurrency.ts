// A tiny counting semaphore for bounding async concurrency. Used by the path
// generator to run slot generation in parallel without firing an unbounded
// number of simultaneous OpenRouter calls. Deliberately dependency-free (we do
// NOT import Next.js's bundled p-limit — that path isn't stable across upgrades)
// and ~30 lines, so it's trivial to read and test.
//
// Safe on Node's single-threaded event loop: `acquire()` does the
// `active < limit` check and the queue push with NO `await` between them, so a
// waiter can never slip past the limit.

export interface Semaphore {
  /** Run `fn` once a slot is free, releasing the slot when it settles. */
  run<T>(fn: () => Promise<T>): Promise<T>;
}

export function createSemaphore(limit: number): Semaphore {
  const max = Math.max(1, Math.floor(limit));
  let active = 0;
  const queue: Array<() => void> = [];

  function release(): void {
    active -= 1;
    const next = queue.shift();
    if (next) {
      active += 1;
      next();
    }
  }

  async function acquire(): Promise<void> {
    if (active < max) {
      active += 1;
      return;
    }
    await new Promise<void>((resolve) => queue.push(resolve));
  }

  return {
    async run<T>(fn: () => Promise<T>): Promise<T> {
      await acquire();
      try {
        return await fn();
      } finally {
        release();
      }
    },
  };
}
