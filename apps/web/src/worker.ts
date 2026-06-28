import { runWorkerLoop } from '@/lib/background-worker';

// Standalone worker entry (`pnpm worker` → dist/worker.mjs). The loop itself
// lives in background-worker.ts so the web server can also run it in-process
// via instrumentation.ts. This file only owns the process lifecycle.

process.on('SIGTERM', () => {
  console.info('[worker] received SIGTERM; exiting after current tick');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.info('[worker] received SIGINT; exiting');
  process.exit(0);
});

void runWorkerLoop();
