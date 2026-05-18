import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  createdResponse,
  successResponse,
  badRequestResponse,
  unauthorizedResponse,
  notFoundResponse,
  tooManyRequestsResponse,
  serviceUnavailableResponse,
  internalErrorResponse,
} from '@/lib/api-response';
import { validateStoragePath } from '@/lib/storage';
import { checkUsageLimit } from '@/lib/usage-limits';
import { rateLimit, rateLimitKey } from '@/lib/rate-limit';
import { engineForTier, runPdfImportJob } from '@/lib/pdf-import/run-job';

// P5 — the entry point for the structured PDF import pipeline.
//
// POST persists a `queued` ImportJob and fires `runPdfImportJob` as a
// detached promise (mirroring `POST /api/learn/paths` → `generatePath`):
// the request returns at once and the client watches the SSE `/progress`
// route. GET lists the caller's recent jobs for the notebook so the UI
// can re-attach after a reload or redeploy.

type Params = { params: Promise<{ id: string }> };

/** Upper bound on page-image paths accepted — far above any real PDF. */
const MAX_PAGE_IMAGES = 1000;
/** Trim the stored file name so a long upload name cannot bloat the row. */
const MAX_FILE_NAME = 255;

interface PdfImportBody {
  sectionId?: unknown;
  fileName?: unknown;
  pdfPath?: unknown;
  pageImagePaths?: unknown;
}

// ─────────────────────────────────────────────────────────────────────
// GET — recent import jobs for this notebook (resume-after-reload UX).
// ─────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: notebookId } = await params;

    const notebook = await db.notebook.findFirst({
      where: { id: notebookId, userId },
      select: { id: true },
    });
    if (!notebook) return notFoundResponse('Notebook not found');

    const jobs = await db.importJob.findMany({
      where: { notebookId, userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        fileName: true,
        status: true,
        progress: true,
        resultPageId: true,
        truncated: true,
        fallbackPages: true,
        error: true,
        createdAt: true,
      },
    });
    return successResponse(jobs);
  } catch (error) {
    console.error('[pdf-import GET]', error);
    return internalErrorResponse();
  }
}

// ─────────────────────────────────────────────────────────────────────
// POST — create an import job and kick off the background worker.
// ─────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: notebookId } = await params;

    // Abuse guard — bounds how often a user can spawn import workers.
    const limit = await rateLimit(rateLimitKey('pdf-import', request, userId), 10, 60_000);
    if (!limit.success) {
      return tooManyRequestsResponse(
        'Too many import requests. Please wait a moment and try again.',
        limit.retryAfterMs,
      );
    }

    const notebook = await db.notebook.findFirst({
      where: { id: notebookId, userId },
      select: { id: true },
    });
    if (!notebook) return notFoundResponse('Notebook not found');

    // Resolve the structure engine up front. An unconfigured engine (no
    // API key) would make every page fall back to text-only extraction —
    // no figures, no rich structure. Refuse here so the user gets an
    // honest error instead of a silently degraded import, and so no
    // import budget is spent on it.
    const user = await db.user.findUniqueOrThrow({
      where: { id: userId },
      select: { tier: true },
    });
    const engine = engineForTier(user.tier);
    if (!engine.isConfigured()) {
      console.error('[pdf-import] structure engine is not configured — refusing import');
      return serviceUnavailableResponse(
        'PDF import is temporarily unavailable. Please try again later.',
      );
    }

    const body = (await request.json().catch(() => ({}))) as PdfImportBody;

    const sectionId = typeof body.sectionId === 'string' ? body.sectionId : '';
    if (!sectionId) return badRequestResponse('sectionId is required');
    const section = await db.section.findFirst({
      where: { id: sectionId, notebookId },
      select: { id: true },
    });
    if (!section) return badRequestResponse('Section not found in this notebook');

    const fileName =
      typeof body.fileName === 'string' ? body.fileName.trim().slice(0, MAX_FILE_NAME) : '';
    if (!fileName) return badRequestResponse('fileName is required');

    const pdfPath = typeof body.pdfPath === 'string' ? body.pdfPath : '';
    if (!pdfPath || !validateStoragePath(pdfPath, 'temp-imports/')) {
      return badRequestResponse('Invalid or missing pdfPath');
    }

    if (!Array.isArray(body.pageImagePaths) || body.pageImagePaths.length === 0) {
      return badRequestResponse('pageImagePaths is required');
    }
    if (body.pageImagePaths.length > MAX_PAGE_IMAGES) {
      return badRequestResponse('Too many pages for a single import');
    }
    const pageImagePaths = body.pageImagePaths.filter((p): p is string => typeof p === 'string');
    if (pageImagePaths.length !== body.pageImagePaths.length) {
      return badRequestResponse('pageImagePaths must be an array of strings');
    }
    if (!pageImagePaths.every((p) => validateStoragePath(p, 'temp-imports/'))) {
      return badRequestResponse('Invalid page image path');
    }

    // Budget gate — PDF import is metered in pages, not import count.
    // FREE gets a one-time lifetime allowance; PRO a monthly one. A PDF
    // longer than the budget is not rejected: the worker imports up to
    // `pageCap` pages and appends a truncation notice.
    const totalPages = pageImagePaths.length;
    const usage = await checkUsageLimit(userId, 'pdf_import');
    const remaining = usage.limit === -1 ? totalPages : usage.limit - usage.used;
    if (remaining <= 0) {
      return tooManyRequestsResponse(
        user.tier === 'FREE'
          ? 'You have used your free PDF import allowance. Upgrade to Pro to import more.'
          : 'You have reached your monthly PDF import limit. It resets at the start of next month.',
      );
    }
    const pageCap = Math.min(totalPages, remaining);

    // `engine.name` + the budget-derived `pageCap` are recorded on the row
    // so the worker is self-contained and the choice is auditable later.
    const job = await db.importJob.create({
      data: {
        notebookId,
        sectionId,
        userId,
        fileName,
        engine: engine.name,
        pageCap,
        status: 'queued',
        pdfPath,
        pageImagePaths: pageImagePaths as unknown as Prisma.InputJsonValue,
      },
    });

    // Fire-and-forget — `runPdfImportJob` never throws; the inner catch is
    // only here for a synchronous scheduling failure. Usage is metered by
    // the worker on success (pages actually imported), not here.
    void runPdfImportJob(job.id).catch((err) => {
      console.error(`[pdf-import] worker crashed for job ${job.id}`, err);
    });

    return createdResponse({ jobId: job.id, status: job.status });
  } catch (error) {
    console.error('[pdf-import POST]', error);
    return internalErrorResponse();
  }
}
