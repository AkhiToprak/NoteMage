import * as Sentry from '@sentry/nextjs';
import { db } from '@/lib/db';
import type { TypedBackgroundJob } from '@/lib/background-jobs';
import { scheduleNextReminderSweep, scheduleNextDeletionSweep } from '@/lib/background-jobs';
import { sweepPausedAccountsForDeletion } from '@/lib/account-deletion';
import { runExamReminderSweep } from '@/lib/exam-reminders';
import { runPdfImportJob } from '@/lib/pdf-import/run-job';
import { runVideoImportJob } from '@/lib/video-import/run-job';
import { runOneNoteImportJob } from '@/lib/onenote-import/run-job';
import { generatePath } from '@/lib/path-generator';
import { runConceptBackfill } from '@/lib/concept-backfill';
import { runMisconceptionTag, runMisconceptionTagBatch } from '@/lib/concept-misconception-tag';
import { runConceptDedup, runConceptDedupBackfill } from '@/lib/concept-dedup';
import { enqueueJob } from '@/lib/background-jobs';
import { pollGeminiBatch } from '@/lib/gemini-batch';
import { captionBatchComplete } from '@/lib/image-captions';
import { deriveStructuralEdgesForPlan } from '@/lib/concept-edges';
import { runWeaknessNudgeSweepPage, scheduleNextNudgeSweep } from '@/lib/weakness-nudges';
import { checkAiSpendAlarm } from '@/lib/ai-spend-alarm';

/** Read notifications never expired — a per-user table grows without bound. The
 *  hourly reminders.sweep prunes read rows past this window; the sweep is served
 *  by @@index([read, createdAt]). Unread rows are left alone. */
const NOTIFICATION_RETENTION_DAYS = 60;

async function pruneOldNotifications(): Promise<number> {
  const cutoff = new Date(Date.now() - NOTIFICATION_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const { count } = await db.notification.deleteMany({
    where: { read: true, createdAt: { lt: cutoff } },
  });
  return count;
}

export async function runJob(job: TypedBackgroundJob): Promise<void> {
  switch (job.kind) {
    case 'import.pdf':
      await runPdfImportJob(job.payload.jobId);
      return;
    case 'import.video':
      await runVideoImportJob(job.payload.jobId);
      return;
    case 'import.onenote':
      await runOneNoteImportJob(job.payload.jobId);
      return;
    case 'path.generate':
      await generatePath(job.payload.planId, { allowRefund: job.payload.allowRefund });
      return;
    case 'path.regenerate':
      await generatePath(job.payload.planId);
      return;
    case 'concept.backfill':
      // Weakness Training Phase 1A (§3.3) — best-effort, idempotent, bounded.
      // The handler itself swallows its own failures (never throws), but the
      // catch-all below stays as a backstop consistent with every other case.
      await runConceptBackfill(job.payload.slotId);
      return;
    case 'concept.misconception':
      // DEPRECATED (Phase 5 / audit M2a) — superseded by
      // 'concept.misconception.batch'. Kept registered for ONE release so
      // in-flight per-concept jobs drain; REMOVE next release along with the
      // kind + payload in background-jobs.ts and runMisconceptionTag.
      await runMisconceptionTag(job.payload.conceptId, job.payload.userId);
      return;
    case 'concept.misconception.batch':
      // Phase 5 (audit M2a) — per-user debounced batch. Re-queries eligibility
      // at run time, tags up to 20 concepts in ONE LLM call, re-enqueues itself
      // when more remain. Best-effort; never throws.
      await runMisconceptionTagBatch(job.payload.userId);
      return;
    case 'ai.batch.poll': {
      // Phase 5 (audit M1) — poll a submitted Gemini batch. RUNNING → enqueue
      // the next poll one interval out and return (chain perpetuates like the
      // sweeps). SUCCEEDED → dispatch results to the domain handler. FAILED →
      // fall back to the domain's inline path.
      const { batchName, domain, context } = job.payload;
      const poll = await pollGeminiBatch(batchName);
      if (poll.state === 'running') {
        await enqueueJob(
          'ai.batch.poll',
          { batchName, domain, context },
          {
            dedupeKey: `ai.batch.poll:${batchName}`,
            runAt: new Date(Date.now() + 5 * 60_000),
            maxAttempts: job.maxAttempts,
          },
        );
        return;
      }
      if (domain === 'captions') {
        if (poll.state === 'succeeded') {
          await captionBatchComplete(poll.results ?? [], context);
        } else {
          // FAILED — heal via the inline sweep path is not re-triggerable here
          // (the source page isn't in the payload); the layer-3 lazy
          // captioning pass still fills these at first generation. Log for
          // visibility.
          console.error('[ai.batch.poll] captions batch failed', { batchName });
        }
      }
      return;
    }
    case 'concept.dedup':
      // Weakness Training Phase 4.1b (phase4 §11.2 tier 2) — best-effort,
      // flag-gated, idempotent (only writes rows where canonicalId IS NULL).
      await runConceptDedup(job.payload.conceptId);
      return;
    case 'concept.dedup.backfill':
      // Phase 4.1b (phase4 §11.7) — per-user, bounded, resumable via
      // embedding-null rows as the checkpoint.
      await runConceptDedupBackfill(job.payload.userId);
      return;
    case 'concept.edges.derive':
      // Phase 4.2a (phase4 §12.1 tier 0) — structural edges from slot order /
      // coversSlotIds. Idempotent upserts; skip-and-log on any bad edge.
      await deriveStructuralEdgesForPlan(job.payload.planId);
      return;
    case 'weakness.nudge_sweep': {
      // Phase 4.4a (phase4 §14.6) — one resumable page per run; the page
      // re-enqueues its own continuation, and only a COMPLETED full pass
      // advances the daily chain.
      const { done } = await runWeaknessNudgeSweepPage();
      if (done) await scheduleNextNudgeSweep();
      return;
    }
    case 'reminders.sweep': {
      // Perpetuate the chain first so a failing sweep can't stop future runs;
      // the bucketed dedupeKey makes a re-run on retry a no-op.
      await scheduleNextReminderSweep();
      const summary = await runExamReminderSweep();
      if (summary.created > 0 || summary.emailed > 0) {
        console.info(
          `[reminders] swept ${summary.examsScanned} exams · created ${summary.created} · emailed ${summary.emailed}`,
        );
      }
      // Piggyback the periodic notification retention prune on this hourly chain.
      const pruned = await pruneOldNotifications().catch((err) => {
        console.error('[notifications] prune failed', err);
        return 0;
      });
      if (pruned > 0) console.info(`[notifications] pruned ${pruned} read notification(s) past retention`);
      // Piggyback the AI spend watchdog on the same hourly chain. Self-contained
      // (never throws), so a failing spend query can't stop the sweep.
      await checkAiSpendAlarm();
      return;
    }
    case 'accounts.deletion_sweep': {
      // Trial rework — perpetuate the daily chain first (bucketed dedupeKey makes
      // a retry a no-op), then hard-delete paused accounts past retention.
      await scheduleNextDeletionSweep();
      const { deleted } = await sweepPausedAccountsForDeletion();
      if (deleted > 0) console.info(`[account-deletion] swept ${deleted} paused account(s)`);
      return;
    }
    default:
      Sentry.captureMessage(
        `Unknown background job kind: ${String((job as { kind?: unknown }).kind)}`
      );
      throw new Error('Unknown background job kind');
  }
}
