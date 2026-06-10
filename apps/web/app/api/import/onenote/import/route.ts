import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { getValidAccessToken } from '@/lib/microsoftAuth';
import { rateLimit, rateLimitKey } from '@/lib/rate-limit';
import { runOneNoteImportJob, MAX_ONENOTE_PAGES } from '@/lib/onenote-import/run-job';
import {
  createdResponse,
  badRequestResponse,
  unauthorizedResponse,
  notFoundResponse,
  tooManyRequestsResponse,
  internalErrorResponse,
} from '@/lib/api-response';

// Phase 4 of the OneNote-import plan — the queue-and-fire trigger route.
//
// This replaces the old synchronous importer, which ran the whole
// section/page/image walk inside the request and timed out on large
// notebooks. Modeled on `POST /api/notebooks/[id]/pdf-import`: it persists a
// `queued` ImportJob and fires `runOneNoteImportJob` as a detached promise, so
// the request returns at once and the client watches the neutral SSE
// `/api/import/jobs/[jobId]/progress` route (Phase 3). All the real work — the
// HTML→Tiptap converter, the SSRF-guarded image download, the image-URL fix,
// Graph pagination, and the hard page cap — now lives in the worker.
//
// Access is free (no AI cost), so the only guards here are an anti-abuse rate
// limit and the worker's hard page cap; nothing is metered.

/** Cap on sections accepted in one import — far above any real selection. */
const MAX_ONENOTE_SECTIONS = 50;

interface OneNoteImportBody {
  targetNotebookId?: unknown;
  sectionIds?: unknown;
}

/**
 * POST — queue a OneNote import and kick off the background worker.
 * Body: `{ targetNotebookId: string, sectionIds: string[] }`.
 * Returns 201 `{ jobId }` immediately; progress streams over the SSE route.
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    // Abuse guard first — bounds how often a user can spawn import workers and
    // shields the Microsoft token endpoint (hit below) from a request flood.
    const limit = await rateLimit(rateLimitKey('onenote-import', request, userId), 5, 60_000);
    if (!limit.success) {
      return tooManyRequestsResponse(
        'Too many import requests. Please wait a moment and try again.',
        limit.retryAfterMs,
      );
    }

    const body = (await request.json().catch(() => ({}))) as OneNoteImportBody;

    const targetNotebookId =
      typeof body.targetNotebookId === 'string' ? body.targetNotebookId : '';
    if (!targetNotebookId) return badRequestResponse('targetNotebookId is required');

    // Dedupe + drop non-string ids: a duplicate section id would otherwise be
    // imported twice (two NoteMage sections), so collapse them up front.
    const rawSectionIds = Array.isArray(body.sectionIds) ? body.sectionIds : [];
    const sectionIds = [
      ...new Set(rawSectionIds.filter((s): s is string => typeof s === 'string' && s.length > 0)),
    ];
    if (sectionIds.length === 0) return badRequestResponse('sectionIds is required');
    if (sectionIds.length > MAX_ONENOTE_SECTIONS) {
      return badRequestResponse('Too many sections selected for a single import.');
    }

    // Notebook ownership — a cheap DB check before the network round-trip below.
    const notebook = await db.notebook.findFirst({
      where: { id: targetNotebookId, userId },
      select: { id: true },
    });
    if (!notebook) return notFoundResponse('Notebook not found');

    // Fail fast on a missing/expired Microsoft connection rather than queueing
    // a job the worker would only immediately fail. `getValidAccessToken`
    // returns user-facing messages ("Please reconnect…"); the worker re-checks.
    try {
      await getValidAccessToken(userId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Not connected to Microsoft.';
      return badRequestResponse(message);
    }

    // `pageCap` is the anti-abuse backstop (access is free, so there's no usage
    // budget); the worker re-clamps it to MAX_ONENOTE_PAGES defensively.
    const job = await db.importJob.create({
      data: {
        notebookId: targetNotebookId,
        userId,
        sourceFormat: 'onenote',
        fileName: 'OneNote import',
        engine: 'onenote-html',
        pageCap: MAX_ONENOTE_PAGES,
        status: 'queued',
        oneNoteSectionIds: sectionIds as unknown as Prisma.InputJsonValue,
      },
    });

    // Fire-and-forget — `runOneNoteImportJob` never throws; the inner catch is
    // only here for a synchronous scheduling failure.
    void runOneNoteImportJob(job.id).catch((err) => {
      console.error(`[onenote-import] worker crashed for job ${job.id}`, err);
    });

    return createdResponse({ jobId: job.id, status: job.status });
  } catch (error) {
    console.error('[onenote-import POST]', error);
    return internalErrorResponse();
  }
}
