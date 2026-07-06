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
  // Exam Mode (Phase 6) — recurring exam-reminder sweep. Self-reschedules each
  // run (see scheduleReminderSweep) so the queue acts as a cron without an
  // external scheduler.
  | 'reminders.sweep'
  // Weakness Training Phase 1A (§3.3) — bounded, idempotent slot-scoped
  // concept classification, enqueued post-commit when a graded QuizQuestion
  // has zero ConceptTag rows (see concept-tracking.ts). Handler owned
  // separately; this type only makes the enqueue call typecheck.
  | 'concept.backfill'
  // Weakness Training Phase 3 (§2.3) — misconception LLM tier 2. Async,
  // hysteresis-gated: enqueued only on a weak-band TRANSITION (see
  // concept-tracking.ts), with a 7-day cooldown per concept enforced by the
  // handler (owned separately). This type only makes the enqueue call
  // typecheck.
  // DEPRECATED (Phase 5 / audit M2a) — superseded by
  // 'concept.misconception.batch'. Kept REGISTERED for one release so
  // in-flight per-concept jobs drain; REMOVE next release.
  | 'concept.misconception'
  // Phase 5 (audit M2a) — per-user debounced batch of the tier-2 misconception
  // tag. Replaces the per-concept fan-out: one 2-min-debounced job per user
  // coalesces all concepts from a grading session into ONE forced-tool LLM call
  // (see concept-misconception-tag.ts runMisconceptionTagBatch). Self-re-enqueues
  // when >20 eligible concepts remain.
  | 'concept.misconception.batch'
  // Weakness Training Phase 4.1 (phase4 §11.2) — tier-2 embedding dedup for
  // one freshly-created canonical concept (dedupeKey `concept.dedup:<id>`).
  | 'concept.dedup'
  // Phase 4.1 (phase4 §11.7) — lazy per-user dedup backfill over existing
  // concepts; `WHERE embedding IS NULL` rows are the resume checkpoint.
  | 'concept.dedup.backfill'
  // Weakness Training Phase 4.2 (phase4 §12.1 tier 0) — structural
  // prerequisite-edge derivation for one plan. Idempotent; retroactive.
  | 'concept.edges.derive'
  // Weakness Training Phase 4.4 (phase4 §14.6) — daily per-user nudge sweep.
  // Self-rescheduling like reminders.sweep, plus a durable watermark cursor
  // (NudgeSweepWatermark) so a redeploy mid-sweep resumes, not restarts.
  | 'weakness.nudge_sweep'
  // Trial rework — daily sweep that hard-deletes paused accounts past the 3-month
  // retention window (see src/lib/account-deletion.ts). Self-rescheduling like
  // reminders.sweep; single attempt per run, re-seeded at worker start.
  | 'accounts.deletion_sweep'
  // Phase 5 (audit M1) — poll a submitted Gemini Batch API job. Self-reschedules
  // at now+5min while the batch is RUNNING; on success dispatches results to a
  // per-domain completion handler; on failure falls back to the domain's inline
  // path. `maxAttempts` is high (batches can run for hours). See gemini-batch.ts
  // + background-job-runner.ts.
  | 'ai.batch.poll';

export interface JobPayloadByKind {
  'import.pdf': { jobId: string };
  'import.video': { jobId: string };
  'import.onenote': { jobId: string };
  'path.generate': { planId: string; allowRefund?: boolean };
  'path.regenerate': { planId: string };
  'reminders.sweep': Record<string, never>;
  'concept.backfill': { slotId: string };
  'concept.misconception': { conceptId: string; userId: string };
  'concept.misconception.batch': { userId: string };
  'concept.dedup': { conceptId: string };
  'concept.dedup.backfill': { userId: string };
  'concept.edges.derive': { planId: string };
  'weakness.nudge_sweep': Record<string, never>;
  'accounts.deletion_sweep': Record<string, never>;
  'ai.batch.poll': {
    batchName: string;
    /** Which completion handler dispatches results. Only 'captions' today. */
    domain: 'captions';
    /** Domain-specific context the completion handler needs (e.g. userId). */
    context: { userId: string | null };
  };
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

// ── Trial rework: daily paused-account deletion sweep ─────────────────────────

/** How often the deletion sweep runs (ms). Daily — retention is measured in
 *  months, so finer precision buys nothing. */
export const DELETION_SWEEP_INTERVAL_MS = Number(
  process.env.DELETION_SWEEP_INTERVAL_MS ?? 24 * 60 * 60_000,
);

/** Interval-aligned dedupe key — collapses a self-reschedule and a worker-start
 *  bootstrap targeting the same window into one job (see sweepDedupeKey). */
function deletionSweepDedupeKey(at: Date): string {
  return `accounts.deletion_sweep:${Math.floor(at.getTime() / DELETION_SWEEP_INTERVAL_MS)}`;
}

/** Enqueue the next deletion sweep one interval out, called at the END of each
 *  run so the chain perpetuates. Bucketed dedupeKey → same-window enqueue is a
 *  no-op. Never throws. */
export async function scheduleNextDeletionSweep(after: Date = new Date()): Promise<void> {
  const next = new Date(after.getTime() + DELETION_SWEEP_INTERVAL_MS);
  try {
    await enqueueJob('accounts.deletion_sweep', {}, { dedupeKey: deletionSweepDedupeKey(next), runAt: next, maxAttempts: 1 });
  } catch (error) {
    console.error('[background-jobs] failed to schedule next deletion sweep', error);
  }
}

/** Seed a deletion sweep for the current interval at worker start. Idempotent via
 *  the bucketed dedupeKey; re-seeds the chain if it ever breaks. Never throws. */
export async function bootstrapDeletionSweep(): Promise<void> {
  const now = new Date();
  try {
    await enqueueJob('accounts.deletion_sweep', {}, { dedupeKey: deletionSweepDedupeKey(now), runAt: now, maxAttempts: 1 });
  } catch (error) {
    console.error('[background-jobs] failed to bootstrap deletion sweep', error);
  }
}
