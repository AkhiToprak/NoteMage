// P3 — the background handler for a native video import (Lane 2).
//
// `runVideoImportJob` mirrors `runPdfImportJob`: the POST route persists a
// `queued` import row, charges the minutes meter on submit, queues a durable
// `BackgroundJob`, and returns at once while the client watches progress over
// the SSE route.
//
// Like the PDF worker this NEVER throws — every failure is caught and written to
// `ImportJob.status = "failed"` with a friendly `error`. The minutes meter is
// charged on SUBMIT (by the route), so the worker REFUNDS those minutes on any
// failure (including a pre-flight cost-ceiling reject inside `ingestVideo`). The
// temp upload is deleted only on success so a `failed` job can be retried.

import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { downloadFromStorage, deleteFile } from '@/lib/storage';
import { incrementUsage, refundUsage } from '@/lib/usage-limits';
import { videoMimeFromName } from '@/lib/file-validation';
import { ingestVideo, VideoIngestError } from './gemini-ingest';
import { notesToPageDoc, deriveVideoPageTitle } from './notes-to-page';
import { minutesForDuration } from './submit';
import type { VideoMediaResolution } from './config';

/** Empty placeholder document for the page row while the worker fills it in. */
const EMPTY_DOC = { type: 'doc', content: [{ type: 'paragraph' }] };

/** Progress snapshot written to `ImportJob.progress` and relayed over SSE. */
export interface VideoImportProgress {
  phase: 'preparing' | 'analysing' | 'finalizing';
  message: string;
}

function progressJson(progress: VideoImportProgress): Prisma.InputJsonValue {
  return progress as unknown as Prisma.InputJsonValue;
}

/** Tokens/sec the input was billed at, by media resolution (post-hoc reconcile). */
const TOKENS_PER_SEC: Record<VideoMediaResolution, number> = { low: 100, default: 300 };

/** Actual minutes implied by the real input token count from usageMetadata. */
function minutesFromTokens(promptTokens: number, resolution: VideoMediaResolution): number {
  const perSec = TOKENS_PER_SEC[resolution];
  const seconds = promptTokens / perSec;
  return Math.max(1, Math.ceil(seconds / 60));
}

/** Best-effort progress write — a failed write must not abort the import. */
async function writeProgress(jobId: string, progress: VideoImportProgress): Promise<void> {
  await db.importJob
    .update({ where: { id: jobId }, data: { progress: progressJson(progress) } })
    .catch((err) => {
      console.error(`[video-import] progress write failed for job ${jobId}`, err);
    });
}

/**
 * Run a queued video `ImportJob` to completion: loads the job, resolves the
 * source (uploaded file → download bytes, or a YouTube URL), runs the Gemini
 * native video call, maps the notes JSON to one Page, and marks the job `ready`.
 *
 * Never throws. The route already charged `incrementUsage('video_ingest',
 * minutes)` on submit, so every failure path here refunds those minutes. Temp
 * uploads are deleted only on success so a `failed` job can be retried without a
 * re-upload.
 */
export async function runVideoImportJob(jobId: string): Promise<void> {
  const job = await db.importJob
    .findUnique({
      where: { id: jobId },
      include: { user: { select: { tier: true } } },
    })
    .catch((err) => {
      console.error(`[video-import] could not load job ${jobId}`, err);
      return null;
    });
  if (!job) {
    console.error(`[video-import] job ${jobId} not found`);
    return;
  }

  // Video jobs always populate a target section + a duration + exactly one of
  // (videoPath | videoUrl). The shared ImportJob row makes these nullable for
  // the PDF/OneNote variants, so narrow them here: a video job missing its
  // source can't be processed — fail it cleanly rather than crash.
  if (job.sectionId === null || job.videoDurationSec === null) {
    console.error(`[video-import] job ${jobId} is missing video source fields`);
    // Atomic claim so a concurrent cancel can't make us double-refund.
    const claimed = await db.importJob
      .updateMany({
        where: { id: jobId, status: { in: ['processing', 'queued'] } },
        data: {
          status: 'failed',
          error: 'This import is missing its video data. Please try the import again.',
          finishedAt: new Date(),
        },
      })
      .catch(() => ({ count: 0 }));
    // Source fields are unusable, but the route still charged minutes — refund
    // the charge for this (malformed) row on a winning claim only.
    if (claimed.count > 0) {
      await refundUsage(
        job.userId,
        'video_ingest',
        minutesForDuration(job.videoDurationSec),
      ).catch(() => {});
    }
    return;
  }

  const sectionId = job.sectionId;
  const durationSec = job.videoDurationSec;
  const minutes = minutesForDuration(durationSec);
  const resolution: VideoMediaResolution =
    job.mediaResolution === 'default' ? 'default' : 'low';

  let succeeded = false;
  try {
    await db.importJob.update({
      where: { id: jobId },
      data: {
        status: 'processing',
        startedAt: new Date(),
        error: null,
        progress: progressJson({ phase: 'preparing', message: 'Preparing your video…' }),
      },
    });

    // Resolve the source. Exactly one of videoPath / videoUrl is set.
    let fileBuffer: Buffer | undefined;
    let mimeType: string | undefined;
    let youtubeUrl: string | undefined;
    if (job.videoUrl) {
      youtubeUrl = job.videoUrl;
    } else if (job.videoPath) {
      try {
        fileBuffer = await downloadFromStorage(job.videoPath);
      } catch {
        throw new VideoIngestError(
          'The uploaded video could not be found. Please try the import again.',
        );
      }
      mimeType = videoMimeFromName(job.fileName);
    } else {
      throw new VideoIngestError('This import is missing its video source.');
    }

    await writeProgress(jobId, {
      phase: 'analysing',
      message: 'Watching the video and taking notes…',
    });

    const { notes, promptTokens, mediaPromptTokens } = await ingestVideo({
      userId: job.userId,
      tier: job.user.tier,
      durationSec,
      resolution,
      source: { fileBuffer, mimeType, youtubeUrl },
    });

    await writeProgress(jobId, { phase: 'finalizing', message: 'Building your page…' });

    const { doc, textContent, truncated } = notesToPageDoc(notes);
    const title = deriveVideoPageTitle(notes, job.pageTitle?.trim() || job.fileName);

    const sortAgg = await db.page.aggregate({
      where: { sectionId },
      _max: { sortOrder: true },
    });
    const page = await db.page.create({
      data: {
        sectionId,
        title,
        pageType: 'text',
        content: EMPTY_DOC as unknown as Prisma.InputJsonValue,
        sortOrder: (sortAgg._max.sortOrder ?? -1) + 1,
      },
    });
    await db.importJob.update({ where: { id: jobId }, data: { resultPageId: page.id } });

    await db.page.update({
      where: { id: page.id },
      data: { content: doc as unknown as Prisma.InputJsonValue, textContent },
    });

    // Atomic claim: only mark `ready` if the job is still unfinished — a cancel
    // (or stale-detector) that won the race already flipped it to `failed` and
    // refunded, so honour that and discard this late page.
    const finalized = await db.importJob.updateMany({
      where: { id: jobId, status: { in: ['processing', 'queued'] } },
      data: {
        status: 'ready',
        error: null,
        truncated,
        finishedAt: new Date(),
        progress: progressJson({ phase: 'finalizing', message: 'Import complete.' }),
      },
    });
    if (finalized.count === 0) {
      // Lost to a cancel — the page we just built is orphaned; drop it.
      await db.page.delete({ where: { id: page.id } }).catch(() => {});
      await db.importJob
        .update({ where: { id: jobId }, data: { resultPageId: null } })
        .catch(() => {});
      return;
    }

    // Post-hoc reconcile (D4): the route charged minutes from the UNTRUSTED
    // client-supplied duration. The real video token count is authoritative
    // (~100 tok/s at LOW res), so if the actual minutes exceed what was charged,
    // bill the under-reported delta. We never refund an over-estimate here —
    // that would let a client low-ball the duration gate and recover the charge.
    // Reconcile from the VIDEO+AUDIO modality tokens only (the text-prompt
    // overhead in promptTokens would over-attribute video minutes); fall back to
    // the total promptTokens basis when the API omits the modality breakdown.
    const reconcileTokens = mediaPromptTokens > 0 ? mediaPromptTokens : promptTokens;
    const actualMinutes = minutesFromTokens(reconcileTokens, resolution);
    if (actualMinutes > minutes) {
      await incrementUsage(job.userId, 'video_ingest', actualMinutes - minutes).catch((err) => {
        console.error(`[video-import] reconcile increment failed for job ${jobId}`, err);
      });
    }

    succeeded = true;
  } catch (err) {
    const message =
      err instanceof VideoIngestError
        ? err.message
        : 'Something went wrong while importing this video. Please try again.';
    if (!(err instanceof VideoIngestError)) {
      console.error(`[video-import] job ${jobId} failed`, err);
    }
    // Atomic claim: flip to `failed` only if still unfinished, so exactly one
    // party (this worker, a cancel, or the stale-detector) owns the refund. The
    // minutes (charged on submit) are refunded ONLY on a winning claim — a job
    // already cancelled was refunded by the canceller; don't double-refund.
    const claimed = await db.importJob
      .updateMany({
        where: { id: jobId, status: { in: ['processing', 'queued'] } },
        data: { status: 'failed', error: message, finishedAt: new Date() },
      })
      .catch((updateErr) => {
        console.error(`[video-import] could not mark job ${jobId} failed`, updateErr);
        return { count: 0 };
      });
    if (claimed.count > 0) {
      await refundUsage(job.userId, 'video_ingest', minutes).catch((refundErr) => {
        console.error(`[video-import] usage refund failed for job ${jobId}`, refundErr);
      });
    }
  } finally {
    // Temp upload kept on failure so "Try again" re-runs without a re-upload;
    // on success it is no longer needed. YouTube jobs have nothing to clean.
    if (succeeded && job.videoPath) {
      await deleteFile(job.videoPath).catch(() => {});
    }
  }
}
