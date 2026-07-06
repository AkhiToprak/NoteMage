import * as Sentry from '@sentry/nextjs';
import type { TypedBackgroundJob } from '@/lib/background-jobs';
import { scheduleNextReminderSweep, scheduleNextDeletionSweep } from '@/lib/background-jobs';
import { sweepPausedAccountsForDeletion } from '@/lib/account-deletion';
import { runExamReminderSweep } from '@/lib/exam-reminders';
import { runPdfImportJob } from '@/lib/pdf-import/run-job';
import { runVideoImportJob } from '@/lib/video-import/run-job';
import { runOneNoteImportJob } from '@/lib/onenote-import/run-job';
import { generatePath } from '@/lib/path-generator';
import { runConceptBackfill } from '@/lib/concept-backfill';
import { runMisconceptionTag } from '@/lib/concept-misconception-tag';
import { runConceptDedup, runConceptDedupBackfill } from '@/lib/concept-dedup';
import { deriveStructuralEdgesForPlan } from '@/lib/concept-edges';
import { runWeaknessNudgeSweepPage, scheduleNextNudgeSweep } from '@/lib/weakness-nudges';

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
      // Weakness Training Phase 3 (§2.3 tier 2) — best-effort, cooldown +
      // hysteresis-gated. The handler itself swallows its own failures
      // (never throws), but the catch-all below stays as a backstop
      // consistent with every other case.
      await runMisconceptionTag(job.payload.conceptId, job.payload.userId);
      return;
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
