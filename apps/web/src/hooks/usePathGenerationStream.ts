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
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Reconnect bookkeeping. `everConnected` flips true once any progress event
  // arrives — past that point we KNOW generation is real and server-side, so a
  // dropped socket reconnects indefinitely (capped backoff) instead of failing.
  // Before the first event, a few open attempts are allowed before giving up.
  const retryRef = useRef(0);
  const everConnectedRef = useRef(false);

  useEffect(() => {
    // Open attempts allowed before a stream that NEVER connected gives up.
    const MAX_OPEN_ATTEMPTS = 6;
    const backoffMs = (n: number) => Math.min(1000 * 2 ** n, 15_000);

    const closeSource = () => {
      if (sourceRef.current) {
        sourceRef.current.close();
        sourceRef.current = null;
      }
    };
    const clearTimer = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    // Reset for this (planId, enabled) pairing.
    closeSource();
    clearTimer();
    retryRef.current = 0;
    everConnectedRef.current = false;
    let cancelled = false;

    if (!enabled || !planId) {
      setState({ status: 'idle', progress: null, plan: null, errorMessage: null, open: false });
      return;
    }

    const connect = () => {
      if (cancelled) return;
      // Only show "connecting" before the first successful event; on a reconnect
      // keep the last known status so the UI never flashes back from generating.
      setState((prev) => ({
        ...prev,
        status: everConnectedRef.current ? prev.status : 'connecting',
        open: true,
      }));

      const url = `/api/learn/paths/${encodeURIComponent(planId)}/generation`;
      const source = new EventSource(url, { withCredentials: true });
      sourceRef.current = source;

      const onProgress = (ev: MessageEvent) => {
        try {
          const payload = JSON.parse(ev.data) as ProgressEnvelope;
          everConnectedRef.current = true;
          retryRef.current = 0; // healthy connection — reset backoff
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
          setState((prev) => ({ ...prev, status: 'ready', plan, open: false }));
        } catch (err) {
          console.error('[usePathGenerationStream] bad done event', err);
        }
        cancelled = true; // terminal — stop reconnecting
        clearTimer();
        closeSource();
      };

      // Server-sent `event: error` — a real, terminal generation failure.
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
        cancelled = true; // terminal — stop reconnecting
        clearTimer();
        closeSource();
      };

      // Native `onerror` = the connection dropped (not a server-reported
      // failure). Generation keeps running server-side, so reconnect with
      // backoff. Only declare failure if we could NEVER connect.
      const onConnectionError = () => {
        closeSource();
        if (cancelled) return;
        const giveUp = !everConnectedRef.current && retryRef.current >= MAX_OPEN_ATTEMPTS;
        if (giveUp) {
          setState((prev) => ({
            ...prev,
            status: 'failed',
            errorMessage: 'Could not open progress stream',
            open: false,
          }));
          return;
        }
        const delay = backoffMs(retryRef.current);
        retryRef.current += 1;
        // Keep the last known status (e.g. 'generating'); just mark closed.
        setState((prev) => ({ ...prev, open: false }));
        timerRef.current = setTimeout(connect, delay);
      };

      source.addEventListener('progress', onProgress as EventListener);
      source.addEventListener('done', onDone as EventListener);
      source.addEventListener('error', onErrorEvent as EventListener);
      source.onerror = onConnectionError;
    };

    connect();

    return () => {
      cancelled = true;
      clearTimer();
      closeSource();
    };
  }, [planId, enabled]);

  return state;
}
