import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  createdResponse,
  successResponse,
  badRequestResponse,
  unauthorizedResponse,
  notFoundResponse,
  paymentRequiredResponse,
  tooManyRequestsResponse,
  serviceUnavailableResponse,
  internalErrorResponse,
} from '@/lib/api-response';
import { validateStoragePath } from '@/lib/storage';
import { checkUsageLimit, reserveUsage, refundUsage } from '@/lib/usage-limits';
import { costRateLimit, rateLimitKey } from '@/lib/rate-limit';
import { resolveModel } from '@/lib/model-routing';
import {
  videoImportDisabled,
  getVideoIngestMaxDurationSec,
  getVideoIngestMediaResolution,
} from '@/lib/video-import/config';
import { isYouTubeUrl, minutesForDuration } from '@/lib/video-import/submit';
import { enqueueJob } from '@/lib/background-jobs';

// P3 — entry point for native video import (Lane 2). POST persists a `queued`
// ImportJob (sourceFormat 'video'), charges the minutes meter on submit, and
// enqueues the durable video worker:
// request returns at once and the client watches the SSE `/progress` route. GET
// lists recent video jobs for the notebook so the UI can re-attach after reload.

type Params = { params: Promise<{ id: string }> };

/** Trim the stored file name so a long upload name cannot bloat the row. */
const MAX_FILE_NAME = 255;
/** Matches the Section/Page title bound enforced elsewhere. */
const MAX_PAGE_TITLE = 200;

interface VideoImportBody {
  sectionId?: unknown;
  fileName?: unknown;
  /** Supabase temp-imports path for an uploaded video (uploaded-file mode). */
  videoPath?: unknown;
  /** Public YouTube URL (URL mode, captionless fallback). */
  videoUrl?: unknown;
  /** Client-supplied duration in seconds — UNTRUSTED; sanity-checked below. */
  durationSec?: unknown;
  /** Optional user-chosen title for the created page. */
  pageTitle?: unknown;
}

// ─────────────────────────────────────────────────────────────────────
// GET — recent video import jobs for this notebook (resume-after-reload UX).
// ─────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: notebookId } = await params;

    const notebook = await db.studyContainer.findFirst({
      where: { id: notebookId, userId },
      select: { id: true },
    });
    if (!notebook) return notFoundResponse('Study pack not found');

    const jobs = await db.importJob.findMany({
      where: { notebookId, userId, sourceFormat: 'video' },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        fileName: true,
        status: true,
        progress: true,
        resultPageId: true,
        truncated: true,
        error: true,
        videoDurationSec: true,
        startedAt: true,
        updatedAt: true,
        createdAt: true,
      },
    });
    return successResponse(jobs);
  } catch (error) {
    console.error('[video-import GET]', error);
    return internalErrorResponse();
  }
}

// ─────────────────────────────────────────────────────────────────────
// POST — create a video import job and kick off the background worker.
// ─────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: notebookId } = await params;

    // Master kill switch — Lane 2 off entirely (feature-off until tested).
    if (videoImportDisabled()) {
      return serviceUnavailableResponse('Video import is currently unavailable.');
    }

    // Abuse guard — bounds how often a user can spawn import workers. Cost-aware
    // (fail-closed in prod): each import runs a paid Gemini native-video call, so
    // a dropped cap means uncapped paid spend.
    const limit = await costRateLimit(rateLimitKey('video-import', request, userId), 10, 60_000);
    if (!limit.success) {
      return tooManyRequestsResponse(
        'Too many import requests. Please wait a moment and try again.',
        limit.retryAfterMs
      );
    }

    const notebook = await db.studyContainer.findFirst({
      where: { id: notebookId, userId },
      select: { id: true },
    });
    if (!notebook) return notFoundResponse('Study pack not found');

    // Gemini must be configured — D3 routes video to Gemini regardless of tier.
    const resolved = resolveModel('video-ingest', {});
    if (!process.env.GEMINI_API_KEY) {
      console.error('[video-import] GEMINI_API_KEY not set — refusing import');
      return serviceUnavailableResponse('Video import is temporarily unavailable.');
    }

    const body = (await request.json().catch(() => ({}))) as VideoImportBody;

    const sectionId = typeof body.sectionId === 'string' ? body.sectionId : '';
    if (!sectionId) return badRequestResponse('sectionId is required');
    const section = await db.section.findFirst({
      where: { id: sectionId, notebookId },
      select: { id: true },
    });
    if (!section) return badRequestResponse('Section not found in this study pack');

    const fileName =
      typeof body.fileName === 'string' ? body.fileName.trim().slice(0, MAX_FILE_NAME) : '';
    if (!fileName) return badRequestResponse('fileName is required');

    if (body.pageTitle !== undefined && typeof body.pageTitle !== 'string') {
      return badRequestResponse('pageTitle must be a string');
    }
    const pageTitle =
      typeof body.pageTitle === 'string' ? body.pageTitle.trim().slice(0, MAX_PAGE_TITLE) : '';

    // Exactly one source mode: an uploaded file path OR a YouTube URL.
    const videoPathRaw = typeof body.videoPath === 'string' ? body.videoPath : '';
    const videoUrlRaw = typeof body.videoUrl === 'string' ? body.videoUrl.trim() : '';
    if ((videoPathRaw && videoUrlRaw) || (!videoPathRaw && !videoUrlRaw)) {
      return badRequestResponse('Provide either a video file or a YouTube URL, not both.');
    }

    let videoPath: string | null = null;
    let videoUrl: string | null = null;
    if (videoPathRaw) {
      // Scope to the caller's temp-import prefix (service-role bypasses RLS).
      if (!validateStoragePath(videoPathRaw, `temp-imports/${userId}/`)) {
        return badRequestResponse('Invalid or missing videoPath');
      }
      videoPath = videoPathRaw;
    } else {
      // YouTube-only allowlist (D8) — SSRF safety. Same shape as the Lane-1 route.
      if (!isYouTubeUrl(videoUrlRaw)) {
        return badRequestResponse('Only YouTube links for now.');
      }
      videoUrl = videoUrlRaw;
    }

    // Duration is client-supplied and UNTRUSTED. Require a positive finite number
    // and reject anything over the hard cap before any meter charge. The worker's
    // post-hoc reconcile corrects under-reporting against usageMetadata.
    const durationSec =
      typeof body.durationSec === 'number' && Number.isFinite(body.durationSec)
        ? Math.floor(body.durationSec)
        : NaN;
    if (!Number.isFinite(durationSec) || durationSec <= 0) {
      return badRequestResponse('A positive video duration is required.');
    }
    const maxDuration = getVideoIngestMaxDurationSec();
    if (durationSec > maxDuration) {
      const maxMin = Math.floor(maxDuration / 60);
      return badRequestResponse(`This video is too long — ${maxMin} minutes max.`);
    }

    // Budget gate — native video notes are metered in MINUTES. FREE gets a small
    // LIFETIME trial budget; PRO a monthly minutes cap; admins are unlimited
    // (limit === -1, skipped here). Reject if the charge exceeds the balance.
    const minutes = minutesForDuration(durationSec);
    const usage = await checkUsageLimit(userId, 'video_ingest');
    if (usage.limit !== -1) {
      const remaining = usage.limit - usage.used;
      if (remaining <= 0) {
        return paymentRequiredResponse(
          usage.limit === 0
            ? 'Video notes are a Pro feature.'
            : usage.lifetime
              ? 'You’ve used all your free video minutes. Upgrade to Pro for more.'
              : 'You’ve reached your monthly video minutes. They reset next month.',
          'video_minutes_exhausted'
        );
      }
      if (minutes > remaining) {
        return tooManyRequestsResponse(
          usage.lifetime
            ? `Not enough free video minutes left (${remaining} remaining).`
            : `Not enough video minutes left this month (${remaining} remaining).`
        );
      }
    }

    const mediaResolution = getVideoIngestMediaResolution();

    // Charge on submit, atomically — `reserveUsage` checks the cap and charges
    // the minutes inside one advisory-locked transaction, closing the TOCTOU
    // window between the read-gate above and the charge. The worker refunds on
    // fail/cancel (same current-month row `incrementUsage`/`refundUsage` use).
    // An `allowed:false` here means a concurrent submit consumed the balance
    // after the gate read — reject without creating a job.
    const reservation = await reserveUsage(userId, 'video_ingest', minutes);
    if (!reservation.allowed) {
      const remaining = Math.max(0, reservation.limit - reservation.used);
      return tooManyRequestsResponse(
        reservation.lifetime
          ? `Not enough free video minutes left (${remaining} remaining).`
          : `Not enough video minutes left this month (${remaining} remaining).`
      );
    }

    let job: { id: string; status: string };
    try {
      job = await db.importJob.create({
        data: {
          notebookId,
          sectionId,
          userId,
          sourceFormat: 'video',
          fileName,
          engine: resolved.token === 'flash-lite' ? 'gemini-flash-lite' : 'gemini-flash',
          pageTitle: pageTitle || null,
          pageCap: 1,
          status: 'queued',
          videoPath,
          videoUrl,
          videoDurationSec: durationSec,
          mediaResolution,
        },
      });
    } catch (err) {
      // Could not even persist the job — refund the just-charged minutes so the
      // failed submit doesn't burn the user's balance.
      await refundUsage(userId, 'video_ingest', minutes).catch(() => {});
      throw err;
    }

    // If scheduling itself fails, refund the minutes since the worker that
    // would normally refund on failure never started.
    try {
      await enqueueJob('import.video', { jobId: job.id }, { dedupeKey: `import:video:${job.id}` });
    } catch (err) {
      console.error(`[video-import] worker enqueue failed for job ${job.id}`, err);
      await refundUsage(userId, 'video_ingest', minutes).catch(() => {});
      throw err;
    }

    return createdResponse({ jobId: job.id, status: job.status });
  } catch (error) {
    console.error('[video-import POST]', error);
    return internalErrorResponse();
  }
}
