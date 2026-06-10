'use client';

// Phase 10.4 — EventSource wrapper for the path-generation SSE stream
// (`GET /api/learn/paths/[planId]/generation`).
//
// Wire format on the server (see
// apps/web/app/api/learn/paths/[planId]/generation/route.ts):
//
//   event: progress
//   data: { status, progress: { totalSlots, completedSlots,
//                               currentSlot: { id, title } | null,
//                               currentActivity: 'theory'|'flashcards'|'quiz'|null } | null }
//
//   event: done
//   data: <serialized path tree from path-loader.ts>
//
//   event: error
//   data: { message }
//
// The hook keeps a single EventSource alive while `planId` is non-null
// and `enabled` is true. It auto-closes when the planId changes, the
// caller disables it, the server emits `done` or `error`, or the
// component unmounts. Reconnect is left to the caller (re-mount or
// flip `enabled` off then on) — generation runs on the server even when
// the SSE drops, so a fresh connection picks up wherever the orchestrator
// is.

import { useEffect, useRef, useState } from 'react';

export interface PathGenerationProgress {
  totalSlots: number;
  completedSlots: number;
  currentSlot: { id: string; title: string } | null;
  currentActivity: 'theory' | 'flashcards' | 'quiz' | null;
}

export type PathGenerationStatus =
  | 'idle'
  | 'connecting'
  | 'queued'
  | 'generating'
  | 'ready'
  | 'failed';

interface ProgressEnvelope {
  status: PathGenerationStatus;
  progress: PathGenerationProgress | null;
}

export interface UsePathGenerationStreamResult {
  status: PathGenerationStatus;
  progress: PathGenerationProgress | null;
  /** Serialized path tree from the `done` event. Null until generation completes. */
  plan: unknown | null;
  /** Server-reported error message (from `error` event or `generationError`). */
  errorMessage: string | null;
  /** Connection state — false once the stream closes (done / failed / aborted). */
  open: boolean;
}

export function usePathGenerationStream(
  planId: string | null,
  enabled: boolean,
): UsePathGenerationStreamResult {
  const [state, setState] = useState<UsePathGenerationStreamResult>({
    status: 'idle',
    progress: null,
    plan: null,
    errorMessage: null,
    open: false,
  });
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    // Clean up any previous connection. Always run, even when disabling,
    // so a flipped flag closes the socket promptly.
    if (sourceRef.current) {
      sourceRef.current.close();
      sourceRef.current = null;
    }

    if (!enabled || !planId) {
      setState({ status: 'idle', progress: null, plan: null, errorMessage: null, open: false });
      return;
    }

    setState({ status: 'connecting', progress: null, plan: null, errorMessage: null, open: true });

    const url = `/api/learn/paths/${encodeURIComponent(planId)}/generation`;
    const source = new EventSource(url, { withCredentials: true });
    sourceRef.current = source;

    const onProgress = (ev: MessageEvent) => {
      try {
        const payload = JSON.parse(ev.data) as ProgressEnvelope;
        setState((prev) => ({
          ...prev,
          status: payload.status ?? prev.status,
          progress: payload.progress ?? prev.progress,
          open: true,
        }));
      } catch (err) {
        console.error('[usePathGenerationStream] bad progress event', err);
      }
    };

    const onDone = (ev: MessageEvent) => {
      try {
        const plan = JSON.parse(ev.data);
        setState((prev) => ({
          ...prev,
          status: 'ready',
          plan,
          open: false,
        }));
      } catch (err) {
        console.error('[usePathGenerationStream] bad done event', err);
      }
      source.close();
      sourceRef.current = null;
    };

    const onErrorEvent = (ev: MessageEvent) => {
      try {
        const payload = JSON.parse(ev.data) as { message?: string };
        setState((prev) => ({
          ...prev,
          status: 'failed',
          errorMessage: payload.message ?? 'Generation failed',
          open: false,
        }));
      } catch {
        setState((prev) => ({
          ...prev,
          status: 'failed',
          errorMessage: 'Generation failed',
          open: false,
        }));
      }
      source.close();
      sourceRef.current = null;
    };

    // Default `onerror` fires when the connection drops mid-stream. We
    // don't auto-retry — the orchestrator keeps writing progress to DB,
    // so the caller can re-open by re-mounting the modal.
    const onConnectionError = () => {
      setState((prev) => ({
        ...prev,
        status: prev.status === 'connecting' ? 'failed' : prev.status,
        errorMessage:
          prev.status === 'connecting' ? 'Could not open progress stream' : prev.errorMessage,
        open: false,
      }));
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
  }, [planId, enabled]);

  return state;
}
