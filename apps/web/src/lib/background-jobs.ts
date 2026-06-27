import { Prisma, type BackgroundJob } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { db } from '@/lib/db';

export const BACKGROUND_JOB_STATUSES = {
  queued: 'queued',
  running: 'running',
  succeeded: 'succeeded',
  failed: 'failed',
} as const;

export type BackgroundJobStatus =
  (typeof BACKGROUND_JOB_STATUSES)[keyof typeof BACKGROUND_JOB_STATUSES];

export type JobKind =
  | 'import.pdf'
  | 'import.video'
  | 'import.onenote'
  | 'path.generate'
  | 'path.regenerate'
  | 'path.translate'
  // Exam Mode (Phase 6) — recurring exam-reminder sweep. Self-reschedules each
  // run (see scheduleReminderSweep) so the queue acts as a cron without an
  // external scheduler.
  | 'reminders.sweep';

export interface JobPayloadByKind {
  'import.pdf': { jobId: string };
  'import.video': { jobId: string };
  'import.onenote': { jobId: string };
  'path.generate': { planId: string; allowRefund?: boolean };
  'path.regenerate': { planId: string };
  'path.translate': { planId: string; language: string };
  'reminders.sweep': Record<string, never>;
}

export type TypedBackgroundJob<K extends JobKind = JobKind> = K extends JobKind
  ? Omit<BackgroundJob, 'kind' | 'payload'> & {
      kind: K;
      payload: JobPayloadByKind[K];
    }
  : never;

export interface EnqueueJobOptions {
  dedupeKey?: string;
  runAt?: Date;
  maxAttempts?: number;
}

const DEFAULT_MAX_ATTEMPTS = 3;
const BACKOFF_MS = [60_000, 5 * 60_000, 15 * 60_000];

function serializePayload<K extends JobKind>(payload: JobPayloadByKind[K]): Prisma.InputJsonValue {
  return payload as unknown as Prisma.InputJsonValue;
}

function isPrismaUniqueError(error: unknown): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

export async function enqueueJob<K extends JobKind>(
  kind: K,
  payload: JobPayloadByKind[K],
  options: EnqueueJobOptions = {}
): Promise<TypedBackgroundJob<K>> {
  const dedupeKey = options.dedupeKey ?? null;

  try {
    const job = await db.backgroundJob.create({
      data: {
        kind,
        payload: serializePayload(payload),
        runAt: options.runAt ?? new Date(),
        maxAttempts: options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
        dedupeKey,
      },
    });
    return job as TypedBackgroundJob<K>;
  } catch (error) {
    if (!dedupeKey || !isPrismaUniqueError(error)) throw error;

    const existing = await db.backgroundJob.findFirst({
      where: {
        dedupeKey,
        status: { in: [BACKGROUND_JOB_STATUSES.queued, BACKGROUND_JOB_STATUSES.running] },
      },
    });
    if (existing) return existing as TypedBackgroundJob<K>;

    const job = await db.backgroundJob.create({
      data: {
        kind,
        payload: serializePayload(payload),
        runAt: options.runAt ?? new Date(),
        maxAttempts: options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
        dedupeKey,
      },
    });
    return job as TypedBackgroundJob<K>;
  }
}

export interface ClaimNextJobOptions {
  workerId?: string;
  leaseMs?: number;
}

export async function claimNextJob(
  options: ClaimNextJobOptions = {}
): Promise<TypedBackgroundJob | null> {
  const now = new Date();
  const workerId = options.workerId ?? randomUUID();
  const leaseMs = options.leaseMs ?? 30 * 60_000;
  const staleLockedBefore = new Date(now.getTime() - leaseMs);

  const candidate = await db.backgroundJob.findFirst({
    where: {
      OR: [
        {
          status: BACKGROUND_JOB_STATUSES.queued,
          runAt: { lte: now },
        },
        {
          status: BACKGROUND_JOB_STATUSES.running,
          lockedAt: { lt: staleLockedBefore },
        },
      ],
    },
    orderBy: [{ runAt: 'asc' }, { createdAt: 'asc' }],
  });
  if (!candidate) return null;

  const claimed = await db.backgroundJob.updateMany({
    where: {
      id: candidate.id,
      OR: [
        {
          status: BACKGROUND_JOB_STATUSES.queued,
          runAt: { lte: now },
        },
        {
          status: BACKGROUND_JOB_STATUSES.running,
          lockedAt: { lt: staleLockedBefore },
        },
      ],
    },
    data: {
      status: BACKGROUND_JOB_STATUSES.running,
      lockedAt: now,
      lockedBy: workerId,
      attempts: { increment: 1 },
    },
  });
  if (claimed.count !== 1) return null;

  const job = await db.backgroundJob.findUnique({ where: { id: candidate.id } });
  return job as TypedBackgroundJob | null;
}

export async function heartbeatJob(jobId: string, workerId: string): Promise<void> {
  await db.backgroundJob
    .updateMany({
      where: { id: jobId, status: BACKGROUND_JOB_STATUSES.running, lockedBy: workerId },
      data: { lockedAt: new Date() },
    })
    .catch((error) => {
      console.error(`[background-jobs] heartbeat failed for ${jobId}`, error);
    });
}

export async function completeJob(jobId: string): Promise<void> {
  await db.backgroundJob.update({
    where: { id: jobId },
    data: {
      status: BACKGROUND_JOB_STATUSES.succeeded,
      lockedAt: null,
      lockedBy: null,
      lastError: null,
      dedupeKey: null,
    },
  });
}

export async function failOrRetryJob(job: BackgroundJob, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  const exhausted = job.attempts >= job.maxAttempts;
  const delayMs = BACKOFF_MS[Math.min(Math.max(job.attempts - 1, 0), BACKOFF_MS.length - 1)];

  await db.backgroundJob.update({
    where: { id: job.id },
    data: exhausted
      ? {
          status: BACKGROUND_JOB_STATUSES.failed,
          lockedAt: null,
          lockedBy: null,
          lastError: message,
          dedupeKey: null,
        }
      : {
          status: BACKGROUND_JOB_STATUSES.queued,
          runAt: new Date(Date.now() + delayMs),
          lockedAt: null,
          lockedBy: null,
          lastError: message,
        },
  });
}

// ── Exam Mode (Phase 6): recurring reminder sweep ────────────────────────────

/** How often the reminder sweep runs (ms). One hour is plenty for day-level
 *  reminders and keeps each sweep cheap. */
export const REMINDER_SWEEP_INTERVAL_MS = Number(
  process.env.REMINDER_SWEEP_INTERVAL_MS ?? 60 * 60_000,
);

/**
 * Interval-aligned dedupe key for a sweep scheduled at `at`. Bucketing by the
 * interval means a self-reschedule and a worker-start bootstrap that target the
 * same window collapse to one job — the queue stays a single continuous chain
 * rather than piling up across worker restarts. (A constant key can't be used:
 * the still-`running` current sweep would own it and block the next enqueue.)
 */
function sweepDedupeKey(at: Date): string {
  return `reminders.sweep:${Math.floor(at.getTime() / REMINDER_SWEEP_INTERVAL_MS)}`;
}

/**
 * Enqueue the next reminder sweep one interval out. Called at the END of each
 * sweep run so the chain perpetuates; the bucketed dedupeKey makes it a no-op
 * if that window is already scheduled. Never throws.
 */
export async function scheduleNextReminderSweep(after: Date = new Date()): Promise<void> {
  const next = new Date(after.getTime() + REMINDER_SWEEP_INTERVAL_MS);
  try {
    await enqueueJob('reminders.sweep', {}, { dedupeKey: sweepDedupeKey(next), runAt: next, maxAttempts: 1 });
  } catch (error) {
    console.error('[background-jobs] failed to schedule next reminder sweep', error);
  }
}

/**
 * Seed a sweep for the current interval at worker start. Idempotent via the
 * bucketed dedupeKey, so multiple workers (or restarts within one window) don't
 * create duplicates. If the chain ever breaks (a sweep exhausts its single
 * attempt), the next worker start re-seeds it. Never throws.
 */
export async function bootstrapReminderSweep(): Promise<void> {
  const now = new Date();
  try {
    await enqueueJob('reminders.sweep', {}, { dedupeKey: sweepDedupeKey(now), runAt: now, maxAttempts: 1 });
  } catch (error) {
    console.error('[background-jobs] failed to bootstrap reminder sweep', error);
  }
}
