import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  successResponse,
  badRequestResponse,
  unauthorizedResponse,
  notFoundResponse,
  internalErrorResponse,
} from '@/lib/api-response';
import { deletePageImages } from '@/lib/storage';
import { runPdfImportJob } from '@/lib/pdf-import/run-job';

// P5 — retry a failed or redeploy-killed import. `runPdfImportJob` is
// idempotent only once its prior output is cleared, so this route
// deletes the half-built result page, resets the job to `queued`, and
// re-fires the worker. The client reconnects to the `/progress` SSE.

type Params = { params: Promise<{ id: string; jobId: string }> };

/** Must match the staleness window the progress SSE uses. */
const STALE_AFTER_MS = 10 * 60_000;

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: notebookId, jobId } = await params;

    const job = await db.importJob.findFirst({
      where: { id: jobId, notebookId, userId },
      select: { id: true, status: true, updatedAt: true, resultPageId: true },
    });
    if (!job) return notFoundResponse('Import not found');

    // Retry a `failed` job, or a `processing`/`queued` job the staleness
    // check has given up on. A live, in-flight job is left alone so a
    // double-fire cannot produce two pages.
    const isStale = Date.now() - job.updatedAt.getTime() > STALE_AFTER_MS;
    const retryable =
      job.status === 'failed' ||
      ((job.status === 'processing' || job.status === 'queued') && isStale);
    if (!retryable) {
      if (job.status === 'ready') {
        return badRequestResponse('This PDF has already been imported.');
      }
      return badRequestResponse('This import is still in progress.');
    }

    // Drop a half-built page from the previous run so the retry starts clean.
    if (job.resultPageId) {
      await deletePageImages(job.resultPageId).catch(() => {});
      await db.page.delete({ where: { id: job.resultPageId } }).catch(() => {});
    }

    await db.importJob.update({
      where: { id: jobId },
      data: {
        status: 'queued',
        error: null,
        progress: Prisma.DbNull,
        resultPageId: null,
        truncated: false,
        fallbackPages: 0,
        startedAt: null,
        finishedAt: null,
      },
    });

    void runPdfImportJob(jobId).catch((err) => {
      console.error(`[pdf-import] retry worker crashed for job ${jobId}`, err);
    });

    return successResponse({ jobId, status: 'queued' });
  } catch (error) {
    console.error('[pdf-import retry]', error);
    return internalErrorResponse();
  }
}
