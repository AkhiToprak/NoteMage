import { useState, useRef, useCallback, useEffect } from 'react';
import type { MageConsentPayload, MageRevealGate, MageRevealGatePayload, MageSourcesPayload } from '@/lib/mage-types';
import type { MageActionsPayload, MageActionCard } from '@/lib/mage-actions';
import type { MageWebLink } from '@/lib/mage-web-search';

interface ChatMessage {
  id: string;
  role: string;
  content: string;
  createdAt: string;
}

export interface DonePayload {
  userMessage: ChatMessage;
  assistantMessage: ChatMessage;
  flashcardSet?: { id: string; title: string; cardCount: number };
  quizSet?: { id: string; title: string; questionCount: number };
  studyPlan?: { id: string; title: string; phaseCount: number };
  /** Mage Revolution Phase 4 — resolved citation chips + sourceMode (Mage panel
   * turns only; arrives on the `sources` SSE event after `done`). */
  sources?: MageSourcesPayload;
  /** Mage Revolution Phase 6 — recommended action cards (Mage panel turns only;
   * arrives on the `actions` SSE event after `done`). */
  actions?: MageActionCard[];
  /** P4b — consent chips + their message binding (Mage panel turns only; arrives
   * on the `consent` SSE event after `done`). Live-turn only, never persisted. */
  consent?: MageConsentPayload;
  /** P5 — web citations + optional exhausted notice (arrives on the `web` SSE
   * event after `done`; GLM path only). Live-turn only, never persisted. */
  web?: { links: MageWebLink[]; notice?: string };
  /** Mage Revolution Phase 8 — server-set reveal gate for this turn (arrives on
   * the `reveal_gate` SSE event BEFORE `done`; absent → `open`). */
  revealGate?: MageRevealGate;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    monthlyUsed: number;
    monthlyLimit: number;
  };
  contextStatus: {
    loaded: number;
    skipped: { type: string; name: string; reason: string }[];
    total: number;
    truncated?: boolean;
    originalChars?: number;
    keptChars?: number;
  };
  aborted?: boolean;
  partialText?: string;
  chatTitle?: string;
}

type StreamStatus = 'idle' | 'streaming' | 'done' | 'error';

/**
 * The hook POSTs each message to an explicit `endpoint` (e.g.
 * `/api/mage/messages`). The legacy `{ notebookId, chatId }` shape that resolved
 * to `/api/notebooks/[id]/chats/[chatId]/messages` was dropped in Mage
 * Revolution Phase 10 — the full-page chat that used it (ChatThread) is gone,
 * and the global Mage panel is the only caller.
 */
export interface UseStreamingChatOptions {
  /** Where to POST each message (the SSE endpoint), e.g. '/api/mage/messages'. */
  endpoint: string;
  /**
   * Called once with the raw Response immediately after a successful fetch,
   * before the SSE body is read. Lets a caller read response headers — the
   * Mage panel uses it to pick up `X-Mage-Chat-Id` so it keeps talking to the
   * same server-created thread.
   */
  onResponse?: (response: Response) => void;
}

interface SSEEvent {
  event: string;
  data: string;
}

function parseSSEEvents(buffer: string): { events: SSEEvent[]; remaining: string } {
  const events: SSEEvent[] = [];
  // Split on double newlines to get individual event blocks
  const parts = buffer.split('\n\n');

  // The last part may be incomplete — keep it as remaining
  const remaining = parts.pop() ?? '';

  for (const part of parts) {
    if (!part.trim()) continue;

    let event = '';
    let data = '';

    const lines = part.split('\n');
    for (const line of lines) {
      if (line.startsWith('event: ')) {
        event = line.slice(7);
      } else if (line.startsWith('data: ')) {
        data = line.slice(6);
      }
    }

    if (event && data) {
      events.push({ event, data });
    }
  }

  return { events, remaining };
}

export function useStreamingChat(options: UseStreamingChatOptions) {
  const endpoint = options.endpoint;
  const onResponse = options.onResponse;

  const [streamingText, setStreamingText] = useState('');
  const [status, setStatus] = useState<StreamStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  // Phase 8 — the live reveal gate for the IN-FLIGHT turn, so a caller can hide
  // the streaming text while the answer is gated. Reset to `open` each send.
  const [revealGate, setRevealGate] = useState<MageRevealGate>('open');

  const abortControllerRef = useRef<AbortController | null>(null);
  const streamingTextRef = useRef('');
  const revealGateRef = useRef<MageRevealGate>('open');

  const abort = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const send = useCallback(
    async (
      message: string,
      extraBody?: Record<string, unknown>
    ): Promise<DonePayload | null> => {
      // Abort any in-flight request
      abort();

      const controller = new AbortController();
      abortControllerRef.current = controller;

      setStatus('streaming');
      setStreamingText('');
      streamingTextRef.current = '';
      setError(null);
      setRevealGate('open');
      revealGateRef.current = 'open';

      let response: Response;
      try {
        response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message, ...(extraBody ?? {}) }),
          signal: controller.signal,
        });
      } catch (err) {
        if (controller.signal.aborted) {
          setStatus('done');
          return {
            aborted: true,
            partialText: streamingTextRef.current,
            revealGate: revealGateRef.current,
          } as DonePayload;
        }
        const msg = err instanceof Error ? err.message : 'Network error';
        setStatus('error');
        setError(msg);
        return null;
      }

      if (!response.ok) {
        let msg = `Request failed (${response.status})`;
        try {
          const body = await response.json();
          if (body.error) msg = body.error;
        } catch {
          // ignore parse failure
        }
        setStatus('error');
        setError(msg);
        return null;
      }

      // Surface the raw Response (headers) before consuming the SSE body.
      onResponse?.(response);

      const reader = response.body?.getReader();
      if (!reader) {
        setStatus('error');
        setError('Response body is not readable');
        return null;
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let donePayload: DonePayload | null = null;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const { events, remaining } = parseSSEEvents(buffer);
          buffer = remaining;

          for (const sse of events) {
            switch (sse.event) {
              case 'text': {
                const parsed = JSON.parse(sse.data) as { delta: string };
                streamingTextRef.current += parsed.delta;
                setStreamingText(streamingTextRef.current);
                break;
              }
              case 'reveal_gate': {
                // Phase 8 — arrives before any text so the caller can gate the
                // stream. Mirror it onto the (later) done payload too.
                const parsed = JSON.parse(sse.data) as MageRevealGatePayload;
                revealGateRef.current = parsed.gate;
                setRevealGate(parsed.gate);
                break;
              }
              case 'done': {
                donePayload = JSON.parse(sse.data) as DonePayload;
                donePayload.revealGate = revealGateRef.current;
                setStatus('done');
                break;
              }
              case 'chat_title': {
                const parsed = JSON.parse(sse.data) as { title: string };
                if (donePayload) {
                  donePayload.chatTitle = parsed.title;
                }
                break;
              }
              case 'sources': {
                const parsed = JSON.parse(sse.data) as MageSourcesPayload;
                if (donePayload) {
                  donePayload.sources = parsed;
                }
                break;
              }
              case 'actions': {
                const parsed = JSON.parse(sse.data) as MageActionsPayload;
                if (donePayload) {
                  donePayload.actions = parsed.actions;
                }
                break;
              }
              case 'consent': {
                const parsed = JSON.parse(sse.data) as MageConsentPayload;
                if (donePayload) {
                  donePayload.consent = parsed;
                }
                break;
              }
              case 'web': {
                const parsed = JSON.parse(sse.data) as { links: MageWebLink[]; notice?: string };
                if (donePayload) {
                  donePayload.web = parsed;
                }
                break;
              }
              case 'error': {
                const parsed = JSON.parse(sse.data) as { error: string };
                setStatus('error');
                setError(parsed.error);
                return null;
              }
            }
          }
        }
      } catch (err) {
        if (controller.signal.aborted) {
          setStatus('done');
          return {
            aborted: true,
            partialText: streamingTextRef.current,
            revealGate: revealGateRef.current,
          } as DonePayload;
        }
        const msg = err instanceof Error ? err.message : 'Stream read error';
        setStatus('error');
        setError(msg);
        return null;
      }

      return donePayload;
    },
    [endpoint, abort, onResponse]
  );

  // Clean up on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  return { streamingText, status, error, send, abort, revealGate };
}
