'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface ChatMessage {
  id: string;
  groupId: string;
  senderId: string | null;
  sender: {
    id: string;
    name: string | null;
    username: string;
    avatarUrl: string | null;
  } | null;
  type: string;
  content: string;
  metadata: unknown;
  createdAt: string;
  status?: 'sending' | 'delivered' | 'read';
}

interface UseGroupChatReturn {
  messages: ChatMessage[];
  loading: boolean;
  sending: boolean;
  hasMore: boolean;
  loadMore: () => void;
  sendMessage: (content: string, type?: string, metadata?: unknown) => Promise<void>;
}

interface MessagesResponse {
  messages: ChatMessage[];
  nextCursor: string | null;
}

const POLL_INTERVAL = 5000;
const PAGE_LIMIT = 30;

export function useGroupChat(groupId: string): UseGroupChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  const nextCursorRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const fetchMessages = useCallback(
    async (cursor?: string): Promise<MessagesResponse | null> => {
      try {
        const params = new URLSearchParams({ limit: String(PAGE_LIMIT) });
        if (cursor) params.set('cursor', cursor);

        const res = await fetch(`/api/groups/${groupId}/messages?${params}`);
        if (!res.ok) return null;

        const json = await res.json();
        if (!json.success) return null;

        return json.data as MessagesResponse;
      } catch {
        return null;
      }
    },
    [groupId],
  );

  // Initial load
  useEffect(() => {
    mountedRef.current = true;
    setLoading(true);
    setMessages([]);
    nextCursorRef.current = null;

    fetchMessages().then((data) => {
      if (!mountedRef.current || !data) {
        if (mountedRef.current) setLoading(false);
        return;
      }
      setMessages(data.messages);
      nextCursorRef.current = data.nextCursor;
      setHasMore(data.nextCursor !== null);
      setLoading(false);
    });

    return () => {
      mountedRef.current = false;
    };
  }, [fetchMessages]);

  // Polling — refetch first page and merge by ID
  useEffect(() => {
    function startPolling() {
      pollTimerRef.current = setInterval(async () => {
        if (document.hidden) return;

        const data = await fetchMessages();
        if (!mountedRef.current || !data) return;

        setMessages((prev) => {
          const map = new Map<string, ChatMessage>();
          // Existing messages as base
          for (const msg of prev) {
            map.set(msg.id, msg);
          }
          // Overwrite / add from latest poll
          for (const msg of data.messages) {
            map.set(msg.id, msg);
          }
          // Sort newest-first by createdAt
          return Array.from(map.values()).sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
          );
        });
      }, POLL_INTERVAL);
    }

    function handleVisibilityChange() {
      if (document.hidden) {
        if (pollTimerRef.current) {
          clearInterval(pollTimerRef.current);
          pollTimerRef.current = undefined;
        }
      } else {
        if (!pollTimerRef.current) {
          startPolling();
        }
      }
    }

    startPolling();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = undefined;
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchMessages]);

  const loadMore = useCallback(async () => {
    const cursor = nextCursorRef.current;
    if (!cursor) return;

    const data = await fetchMessages(cursor);
    if (!mountedRef.current || !data) return;

    nextCursorRef.current = data.nextCursor;
    setHasMore(data.nextCursor !== null);

    setMessages((prev) => {
      const map = new Map<string, ChatMessage>();
      for (const msg of prev) {
        map.set(msg.id, msg);
      }
      for (const msg of data.messages) {
        map.set(msg.id, msg);
      }
      return Array.from(map.values()).sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
    });
  }, [fetchMessages]);

  const sendMessage = useCallback(
    async (content: string, type?: string, metadata?: unknown): Promise<void> => {
      setSending(true);

      // Optimistic message with "sending" status
      const tempId = `__sending__${Date.now()}`;
      const optimistic: ChatMessage = {
        id: tempId,
        groupId,
        senderId: null, // will be replaced
        sender: null,
        type: type || 'text',
        content,
        metadata: metadata ?? null,
        createdAt: new Date().toISOString(),
        status: 'sending',
      };
      setMessages((prev) => [optimistic, ...prev]);

      try {
        const body: Record<string, unknown> = { content };
        if (type) body.type = type;
        if (metadata !== undefined) body.metadata = metadata;

        const res = await fetch(`/api/groups/${groupId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          // Remove optimistic message on failure
          setMessages((prev) => prev.filter((m) => m.id !== tempId));
          return;
        }

        const json = await res.json();
        if (!json.success || !json.data) {
          setMessages((prev) => prev.filter((m) => m.id !== tempId));
          return;
        }

        const newMessage = { ...(json.data as ChatMessage), status: 'delivered' as const };

        setMessages((prev) => {
          // Replace optimistic with real message
          const withoutTemp = prev.filter((m) => m.id !== tempId);
          if (withoutTemp.some((m) => m.id === newMessage.id)) return withoutTemp;
          return [newMessage, ...withoutTemp];
        });
      } catch {
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
      } finally {
        if (mountedRef.current) setSending(false);
      }
    },
    [groupId],
  );

  return { messages, loading, sending, hasMore, loadMore, sendMessage };
}
