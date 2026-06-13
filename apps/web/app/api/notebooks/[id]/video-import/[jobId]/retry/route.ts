import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  successResponse,
  badRequestResponse,
  unauthorizedResponse,
  notFoundResponse,
  paymentRequiredResponse,
  tooManyRequestsResponse,
  serviceUnavailableResponse,
  internalErrorResponse,
} from '@/lib/api-response';
import { costRateLimit, rateLimitKey } from '@/lib/rate-limit';
import { deletePageImages } from '@/lib/storage';
import { checkUsageLimit, incrementUsage, refundUsage } from '@/lib/usage-limits';
import { videoImportDisabled } from '@/lib/video-import/config';
import { isVideoJobStale } from '@/lib/video-import/staleness';
import { minutesForDuration } from '@/lib/video-import/submit';
import { runVideoImportJob } from '@/lib/video-import/run-job';

// P3 — retry a failed or redeploy-killed video import. Re-fires the VIDEO worker
// (not the PDF one — the pdf-import retry route hardcodes runPdfImportJob).
//
// No double-charge: minutes were charged on the original submit and REFUNDED by
// the worker's failure path (or the stale-detector), so a retryable job has a
// net-zero balance for this import. This route RE-CHARGES the minutes on a
// winning claim before re-firing, exactly once — guarded by an atomic status
// flip so a double-fire cannot charge twice or produce two pages.

type Params = { params: Promise<{ id: string; jobId: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    // Abuse guard — a retry re-fires the paid Gemini video worker, so cap
    // re-runs (cost-aware, fail-closed in prod) to stop free re-run loops.
    const limit = await costRateLimit(
      rateLimitKey('video-import-retry', request, userId),
      5,
      60_000,
    );
    if (!limit.success) {
      return tooManyRequestsResponse(
        'Too many retries. Please wait a moment and try again.',
        limit.retryAfterMs,
      );
    }

    if (videoImportDisabled()) {
      return serviceUnavailableResponse('Video import is currently unavailable.');
    }

    const { id: notebookId, jobId } = await params;

    const job = await db.importJob.findFirst({
      where: { id: jobId, notebookId, userId, sourceFormat: 'video' },
      select: {
        id: true,
        status: true,
        updatedAt: true,
        resultPageId: true,
        videoDurationSec: true,
      },
    });
    if (!job) return notFoundResponse('Import not found');

    // Retry a `failed` job, or a `processing`/`queued` job the staleness check
    // has given up on. A live, in-flight job is left alone so a double-fire
    // cannot produce two pages.
    const retryable = job.status === 'failed' || isVideoJobStale(job.status, job.updatedAt);
    if (!retryable) {
      if (job.status === 'ready') {
        return badRequestResponse('This video has already been imported.');
      }
      return badRequestResponse('This import is still in progress.');
    }

    const minutes = minutesForDuration(job.videoDurationSec ?? 0);

    // Re-check the budget BEFORE charging — a retry is a fresh charge.
    const usage = await checkUsageLimit(userId, 'video_ingest');
    if (usage.limit !== -1) {
      const remaining = usage.limit - usage.used;
      if (remaining <= 0) {
        return paymentRequiredResponse(
          usage.limit === 0
            ? 'Video notes are a Pro feature.'
            : 'You have reached your monthly video minutes. It resets next month.',
        );
      }
      if (minutes > remaining) {
        return tooManyRequestsResponse(
          `Not enough video minutes left this month (${remaining} remaining).`,
        );
      }
    }

    // Atomic claim: flip a retryable row back to `queued` only if it is still
    // failed/unfinished. A concurrent retry loses the claim and is rejected, so
    // exactly one re-charge + re-fire happens.
    const claimed = await db.importJob.updateMany({
      where: {
        id: jobId,
        userId,
        sourceFormat: 'video',
        OR: [
          { status: 'failed' },
          {
            status: { in: ['processing', 'queued'] },
            updatedAt: { lt: new Date(Date.now() - 20 * 60_000) },
          },
        ],
      },
      data: {
        status: 'queued',
        error: null,
        progress: Prisma.DbNull,
        resultPageId: null,
        truncated: false,
        startedAt: null,
        finishedAt: null,
      },
    });
    if (claimed.count === 0) {
      return badRequestResponse('This import is still in progress.');
    }

    // Drop a half-built page from the previous run so the retry starts clean.
    if (job.resultPageId) {
      await deletePageImages(job.resultPageId).catch(() => {});
      await db.page.delete({ where: { id: job.resultPageId } }).catch(() => {});
    }

    // Re-charge for this fresh attempt (the prior charge was refunded on the
    // failure). On a charge failure, roll the claim back to `failed` so the job
    // isn't left wedged in `queued` with no worker.
    try {
      await incrementUsage(userId, 'video_ingest', minutes);
    } catch (err) {
      console.error(`[video-import] retry charge failed for job ${jobId}`, err);
      await db.importJob
        .update({
          where: { id: jobId },
          data: { status: 'failed', error: 'Could not start the retry. Please try again.' },
        })
        .catch(() => {});
      return internalErrorResponse();
    }

    void runVideoImportJob(jobId).catch(async (err) => {
      console.error(`[video-import] retry worker crashed for job ${jobId}`, err);
      await refundUsage(userId, 'video_ingest', minutes).catch(() => {});
    });

    return successResponse({ jobId, status: 'queued' });
  } catch (error) {
    console.error('[video-import retry]', error);
    return internalErrorResponse();
  }
}
