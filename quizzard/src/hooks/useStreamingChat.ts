import { useState, useRef, useCallback, useEffect } from 'react';

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
  };
  aborted?: boolean;
  partialText?: string;
}

type StreamStatus = 'idle' | 'streaming' | 'done' | 'error';

interface UseStreamingChatOptions {
  notebookId: string;
  chatId: string;
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

export function useStreamingChat({ notebookId, chatId }: UseStreamingChatOptions) {
  const [streamingText, setStreamingText] = useState('');
  const [status, setStatus] = useState<StreamStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const streamingTextRef = useRef('');

  const abort = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const send = useCallback(
    async (message: string): Promise<DonePayload | null> => {
      // Abort any in-flight request
      abort();

      const controller = new AbortController();
      abortControllerRef.current = controller;

      setStatus('streaming');
      setStreamingText('');
      streamingTextRef.current = '';
      setError(null);

      let response: Response;
      try {
        response = await fetch(
          `/api/notebooks/${notebookId}/chats/${chatId}/messages`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message }),
            signal: controller.signal,
          }
        );
      } catch (err) {
        if (controller.signal.aborted) {
          setStatus('done');
          return { aborted: true, partialText: streamingTextRef.current } as DonePayload;
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
              case 'done': {
                donePayload = JSON.parse(sse.data) as DonePayload;
                setStatus('done');
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
          return { aborted: true, partialText: streamingTextRef.current } as DonePayload;
        }
        const msg = err instanceof Error ? err.message : 'Stream read error';
        setStatus('error');
        setError(msg);
        return null;
      }

      return donePayload;
    },
    [notebookId, chatId, abort]
  );

  // Clean up on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  return { streamingText, status, error, send, abort };
}
