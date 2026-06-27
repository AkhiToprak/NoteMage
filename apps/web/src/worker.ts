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

async function main(): Promise<void> {
  console.info(`[worker] started ${WORKER_ID}`);

  // Exam Mode (Phase 6) — seed the recurring exam-reminder sweep. Idempotent
  // (bucketed dedupeKey), and tolerant of the job table not existing yet.
  await bootstrapReminderSweep().catch((error) => {
    console.warn('[worker] reminder-sweep bootstrap deferred', error);
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

process.on('SIGTERM', () => {
  console.info('[worker] received SIGTERM; exiting after current tick');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.info('[worker] received SIGINT; exiting');
  process.exit(0);
});

void main();
