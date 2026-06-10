'use client';

// P5 — EventSource wrapper for the import SSE stream. Defaults to the
// PDF-import route (`GET /api/notebooks/[id]/pdf-import/[jobId]/progress`);
// pass `progressUrl` to point at another job stream — the OneNote modal uses
// the neutral route `GET /api/import/jobs/[jobId]/progress`, whose `done` event
// additionally carries `summary`. Mirrors `usePathGenerationStream`.
//
// Wire format on the server (see
// apps/web/app/api/notebooks/[id]/pdf-import/[jobId]/progress/route.ts and
// apps/web/app/api/import/jobs/[jobId]/progress/route.ts):
//
//   event: progress
//   data: { status, progress: { phase, totalPages, processedPages, message } | null }
//
//   event: done
//   data: { pageId, summary, truncated, fallbackPages }
//       — PDF jobs set `pageId`; OneNote jobs set `summary`.
//
//   event: error
//   data: { message }
//
// The hook keeps one EventSource alive while `notebookId`, `jobId` and
// `enabled` are all set. It auto-closes when any of those changes, when
// the server emits `done`/`error`, or when the component unmounts.
// Reconnect is left to the caller (re-mount or flip `enabled`) — the
// worker keeps running server-side even when the SSE drops, so a fresh
// connection picks up wherever the job is.

import { useEffect, useRef, useState } from 'react';

export interface ImportJobProgress {
  phase: string;
  totalPages: number;
  processedPages: number;
  message: string;
}

/**
 * OneNote-import result, written to `ImportJob.resultSummary` and delivered on
 * the `done` event by the neutral progress route
 * (`/api/import/jobs/[jobId]/progress`). Null for PDF imports, which report a
 * single `resultPageId` instead.
 */
export interface ImportJobSummary {
  sectionsImported: number;
  pagesImported: number;
  errors: string[];
  firstSectionId: string | null;
  firstPageId: string | null;
}

export type ImportJobStatus =
  | 'idle'
  | 'connecting'
  | 'queued'
  | 'processing'
  | 'ready'
  | 'failed';

interface ProgressEnvelope {
  status: ImportJobStatus;
  progress: ImportJobProgress | null;
}

export interface UseImportJobStreamResult {
  status: ImportJobStatus;
  progress: ImportJobProgress | null;
  /** Id of the created notebook page — set once the `done` event arrives.
   *  Always null for OneNote jobs (which report `summary` instead). */
  resultPageId: string | null;
  /**
   * OneNote-import summary — set on `done` for OneNote jobs, null for PDF.
   * Carries the per-section/page counts, any partial errors, and the first
   * imported section/page for the "open notebook" CTA.
   */
  summary: ImportJobSummary | null;
  /** True when the import was size- or page-cap truncated. */
  truncated: boolean;
  /**
   * Pages that fell back to text-only heuristic extraction because the
   * structure engine could not describe them — those pages carry no
   * figures and no rich formatting. 0 when every page was fully analysed.
   */
  fallbackPages: number;
  /** Server-reported error message (from the `error` event). */
  errorMessage: string | null;
  /** Connection state — false once the stream closes (done / failed / aborted). */
  open: boolean;
}

/** Reported when the hook is inactive. */
const IDLE_STATE: UseImportJobStreamResult = {
  status: 'idle',
  progress: null,
  resultPageId: null,
  summary: null,
  truncated: false,
  fallbackPages: 0,
  errorMessage: null,
  open: false,
};

/** Reported while active but before the first SSE event arrives. */
const CONNECTING_STATE: UseImportJobStreamResult = {
  status: 'connecting',
  progress: null,
  resultPageId: null,
  summary: null,
  truncated: false,
  fallbackPages: 0,
  errorMessage: null,
  open: true,
};

export function useImportJobStream(
  notebookId: string | null,
  jobId: string | null,
  enabled: boolean,
  /**
   * SSE endpoint to stream from. Defaults to the PDF progress route, so every
   * existing caller is unchanged. The OneNote modal passes the neutral route
   * `/api/import/jobs/[jobId]/progress`, whose `done` event also carries
   * `summary`. Including it in the stream key re-attaches when it changes.
   */
  progressUrl?: string | null,
): UseImportJobStreamResult {
  // `null` means "active but no SSE event yet" — reported as CONNECTING.
  // All real state arrives through the event-handler callbacks below.
  const [state, setState] = useState<UseImportJobStreamResult | null>(null);
  const sourceRef = useRef<EventSource | null>(null);

  // Drop a previous job's accumulated state when the target changes. This
  // is a render-phase adjustment, not an effect — see react.dev,
  // "You Might Not Need an Effect → Adjusting state on prop change".
  const streamKey = `${notebookId ?? ''} ${jobId ?? ''} ${enabled} ${progressUrl ?? ''}`;
  const [trackedKey, setTrackedKey] = useState(streamKey);
  if (trackedKey !== streamKey) {
    setTrackedKey(streamKey);
    setState(null);
  }

  useEffect(() => {
    // Close any previous connection. Always run, even when disabling, so a
    // flipped flag closes the socket promptly.
    if (sourceRef.current) {
      sourceRef.current.close();
      sourceRef.current = null;
    }

    if (!enabled || !notebookId || !jobId) {
      return;
    }

    const url =
      progressUrl ??
      `/api/notebooks/${encodeURIComponent(notebookId)}/pdf-import/${encodeURIComponent(
        jobId,
      )}/progress`;
    const source = new EventSource(url, { withCredentials: true });
    sourceRef.current = source;

    const onProgress = (ev: MessageEvent) => {
      try {
        const payload = JSON.parse(ev.data) as ProgressEnvelope;
        setState((prev) => {
          const base = prev ?? CONNECTING_STATE;
          return {
            ...base,
            status: payload.status ?? base.status,
            progress: payload.progress ?? base.progress,
            open: true,
          };
        });
      } catch (err) {
        console.error('[useImportJobStream] bad progress event', err);
      }
    };

    const onDone = (ev: MessageEvent) => {
      try {
        const payload = JSON.parse(ev.data) as {
          pageId?: string | null;
          summary?: ImportJobSummary | null;
          truncated?: boolean;
          fallbackPages?: number;
        };
        setState((prev) => ({
          ...(prev ?? CONNECTING_STATE),
          status: 'ready',
          resultPageId: payload.pageId ?? null,
          summary: payload.summary ?? null,
          truncated: payload.truncated ?? false,
          fallbackPages: payload.fallbackPages ?? 0,
          open: false,
        }));
      } catch (err) {
        console.error('[useImportJobStream] bad done event', err);
      }
      source.close();
      sourceRef.current = null;
    };

    const onErrorEvent = (ev: MessageEvent) => {
      let message = 'Import failed';
      try {
        const payload = JSON.parse(ev.data) as { message?: string };
        message = payload.message ?? message;
      } catch {
        /* keep the default message */
      }
      setState((prev) => ({
        ...(prev ?? CONNECTING_STATE),
        status: 'failed',
        errorMessage: message,
        open: false,
      }));
      source.close();
      sourceRef.current = null;
    };

    // Default `onerror` fires when the connection drops mid-stream. We do
    // not auto-retry — the worker keeps writing progress to the DB, so the
    // caller can re-open by re-mounting the modal.
    const onConnectionError = () => {
      setState((prev) => {
        const base = prev ?? CONNECTING_STATE;
        const failedToOpen = base.status === 'connecting';
        return {
          ...base,
          status: failedToOpen ? 'failed' : base.status,
          errorMessage: failedToOpen
            ? 'Could not open the progress stream'
            : base.errorMessage,
          open: false,
        };
      });
      source.close();
      sourceRef.current = null;
    };

    source.addEventListener('progress', onProgress as EventListener);
    source.addEventListener('done', onDone as EventListener);
    source.addEventListener('error', onErrorEvent as EventListener);
    source.onerror = onConnectionError;

    return () => {
      source.removeEventListener('progress', onProgress as EventListener);
      source.removeEventListener('done', onDone as EventListener);
      source.removeEventListener('error', onErrorEvent as EventListener);
      source.onerror = null;
      source.close();
      if (sourceRef.current === source) sourceRef.current = null;
    };
  }, [notebookId, jobId, enabled, progressUrl]);

  if (!enabled || !notebookId || !jobId) return IDLE_STATE;
  return state ?? CONNECTING_STATE;
}
