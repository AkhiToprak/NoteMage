import * as Sentry from '@sentry/nextjs';
import type { TypedBackgroundJob } from '@/lib/background-jobs';
import { scheduleNextReminderSweep } from '@/lib/background-jobs';
import { runExamReminderSweep } from '@/lib/exam-reminders';
import { runPdfImportJob } from '@/lib/pdf-import/run-job';
import { runVideoImportJob } from '@/lib/video-import/run-job';
import { runOneNoteImportJob } from '@/lib/onenote-import/run-job';
import { generatePath } from '@/lib/path-generator';
import { translatePath } from '@/lib/path-translator';
import { isPathLanguage } from '@/lib/path-languages';

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
    case 'path.translate':
      if (!isPathLanguage(job.payload.language)) {
        throw new Error(`Unsupported path translation language: ${job.payload.language}`);
      }
      await translatePath(job.payload.planId, job.payload.language);
      return;
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
    default:
      Sentry.captureMessage(
        `Unknown background job kind: ${String((job as { kind?: unknown }).kind)}`
      );
      throw new Error('Unknown background job kind');
  }
}
