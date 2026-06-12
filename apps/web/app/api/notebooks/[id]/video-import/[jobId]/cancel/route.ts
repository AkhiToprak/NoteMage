import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  successResponse,
  unauthorizedResponse,
  notFoundResponse,
  internalErrorResponse,
} from '@/lib/api-response';
import { deleteFile } from '@/lib/storage';
import { refundUsage } from '@/lib/usage-limits';
import { minutesForDuration } from '@/lib/video-import/submit';

// P3 — cancel an in-flight or wedged video import. Refunds the minutes charged
// on submit (D4: charge on submit, refund on fail/cancel) and cleans the temp
// upload. Idempotent: a job that is already finished (ready/failed) is a no-op
// success — the refund/cleanup only fire on a winning atomic claim, so a double
// cancel (or a cancel racing the worker's own failure-refund) cannot refund
// twice.

type Params = { params: Promise<{ id: string; jobId: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: notebookId, jobId } = await params;

    const job = await db.importJob.findFirst({
      where: { id: jobId, notebookId, userId, sourceFormat: 'video' },
      select: { id: true, status: true, videoPath: true, videoDurationSec: true },
    });
    if (!job) return notFoundResponse('Import not found');

    // Atomic claim — flip an unfinished job to `failed` only if it is still
    // queued/processing. Exactly one claimant (this cancel, vs the worker's own
    // failure path, vs the stale-detector) wins; only the winner refunds.
    const claimed = await db.importJob.updateMany({
      where: { id: jobId, userId, sourceFormat: 'video', status: { in: ['queued', 'processing'] } },
      data: { status: 'failed', error: 'Cancelled.', finishedAt: new Date() },
    });

    if (claimed.count > 0) {
      await refundUsage(
        userId,
        'video_ingest',
        minutesForDuration(job.videoDurationSec ?? 0),
      ).catch(() => {});
      if (job.videoPath) {
        await deleteFile(job.videoPath).catch(() => {});
      }
    }

    return successResponse({ jobId, status: 'cancelled' });
  } catch (error) {
    console.error('[video-import cancel]', error);
    return internalErrorResponse();
  }
}
