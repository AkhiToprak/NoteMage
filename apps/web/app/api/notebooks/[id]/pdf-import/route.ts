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
  internalErrorResponse,
} from '@/lib/api-response';
import { validateStoragePath } from '@/lib/storage';
import { checkUsageLimit, incrementUsage } from '@/lib/usage-limits';
import { rateLimit, rateLimitKey } from '@/lib/rate-limit';
import { engineForTier, pageCapForTier, runPdfImportJob } from '@/lib/pdf-import/run-job';

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

    // Entitlement gate — the monthly import-count meter.
    const usage = await checkUsageLimit(userId, 'pdf_import');
    if (!usage.allowed) {
      return tooManyRequestsResponse(
        'You have reached your monthly PDF import limit. Upgrade your plan to import more.',
      );
    }

    // Engine + per-tier page cap are recorded on the row so the worker is
    // self-contained and the choice is auditable later.
    const user = await db.user.findUniqueOrThrow({
      where: { id: userId },
      select: { tier: true },
    });
    const engine = engineForTier(user.tier);
    const pageCap = pageCapForTier(user.tier);

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
    // only here for a synchronous scheduling failure.
    void runPdfImportJob(job.id).catch((err) => {
      console.error(`[pdf-import] worker crashed for job ${job.id}`, err);
    });

    await incrementUsage(userId, 'pdf_import');

    return createdResponse({ jobId: job.id, status: job.status });
  } catch (error) {
    console.error('[pdf-import POST]', error);
    return internalErrorResponse();
  }
}
