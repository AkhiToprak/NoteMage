import os from 'node:os';
import { randomUUID } from 'node:crypto';
import * as Sentry from '@sentry/nextjs';
import {
  claimNextJob,
  completeJob,
  failOrRetryJob,
  heartbeatJob,
  bootstrapReminderSweep,
} from '@/lib/background-jobs';
import { runJob } from '@/lib/background-job-runner';
import { recoverStalePaths } from '@/lib/path-sweeper';

// Shared worker loop. Two entrypoints use it:
//   • src/worker.ts          — the standalone `pnpm worker` process.
//   • src/instrumentation.ts — runs it IN-PROCESS on the web server so a plain
//     deploy drains the queue without a separate Coolify service.
// DB-level claim locking (claimNextJob) makes both safe to run at once; they
// just compete for jobs.

const WORKER_ID = `${os.hostname()}:${process.pid}:${randomUUID()}`;
const POLL_MS = Number(process.env.BACKGROUND_JOB_POLL_MS ?? 1_000);
const IDLE_MS = Number(process.env.BACKGROUND_JOB_IDLE_MS ?? 2_000);
const LEASE_MS = Number(process.env.BACKGROUND_JOB_LEASE_MS ?? 30 * 60_000);
const HEARTBEAT_MS = Number(process.env.BACKGROUND_JOB_HEARTBEAT_MS ?? 60_000);
const MIGRATION_RETRY_MS = Number(process.env.BACKGROUND_JOB_MIGRATION_RETRY_MS ?? 10_000);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isProbablyMigrationRace(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes('background_jobs') ||
    message.includes('BackgroundJob') ||
    message.includes('does not exist') ||
    message.includes('P2021')
  );
}

async function runClaimedJob(): Promise<boolean> {
  const job = await claimNextJob({ workerId: WORKER_ID, leaseMs: LEASE_MS });
  if (!job) return false;

  console.info(`[worker] claimed ${job.kind} ${job.id}`);
  const heartbeat = setInterval(() => {
    void heartbeatJob(job.id, WORKER_ID);
  }, HEARTBEAT_MS);

  try {
    await runJob(job);
    await completeJob(job.id);
    console.info(`[worker] completed ${job.kind} ${job.id}`);
  } catch (error) {
    console.error(`[worker] failed ${job.kind} ${job.id}`, error);
    Sentry.captureException(error, {
      tags: { jobKind: job.kind },
      extra: { jobId: job.id, attempts: job.attempts, maxAttempts: job.maxAttempts },
    });
    await failOrRetryJob(job, error);
  } finally {
    clearInterval(heartbeat);
  }

  return true;
}

/** Run the poll loop forever. Resolves only if the loop is told to stop. */
export async function runWorkerLoop(): Promise<void> {
  console.info(`[worker] started ${WORKER_ID}`);

  // Exam Mode (Phase 6) — seed the recurring exam-reminder sweep. Idempotent
  // (bucketed dedupeKey), and tolerant of the job table not existing yet.
  await bootstrapReminderSweep().catch((error) => {
    console.warn('[worker] reminder-sweep bootstrap deferred', error);
  });

  // Revive paths a prior process left wedged in `generating` (redeploy mid-run).
  // Idempotent + dedupe-keyed; tolerant of the job table not existing yet.
  await recoverStalePaths().catch((error) => {
    console.warn('[worker] stale-path recovery deferred', error);
  });

  while (true) {
    try {
      const worked = await runClaimedJob();
      await sleep(worked ? POLL_MS : IDLE_MS);
    } catch (error) {
      if (isProbablyMigrationRace(error)) {
        console.warn('[worker] job table unavailable; waiting for migrations');
        await sleep(MIGRATION_RETRY_MS);
        continue;
      }
      console.error('[worker] loop error', error);
      Sentry.captureException(error);
      await sleep(IDLE_MS);
    }
  }
}

let started = false;

/**
 * Start the worker loop once per process (idempotent — guards against double
 * starts on HMR / repeated instrumentation registration). Fire-and-forget; the
 * loop runs for the life of the process.
 */
export function startInProcessWorker(): void {
  if (started) return;
  started = true;
  void runWorkerLoop().catch((error) => {
    console.error('[worker] in-process loop crashed', error);
    Sentry.captureException(error);
    started = false; // allow a later re-trigger to restart it
  });
}
