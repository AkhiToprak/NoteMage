'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useCoworkSocket } from '@/lib/cowork-socket';

interface ChatMessage {
  id: string;
  userId: string;
  username: string;
  text: string;
  timestamp: number;
  pending?: boolean;
}

interface CoWorkChatProps {
  notebookId: string;
  sessionId: string;
  currentUserId: string;
  currentUsername: string;
}

interface ServerMessage {
  id: string;
  sessionId: string;
  userId: string;
  username: string;
  avatarUrl: string | null;
  text: string;
  createdAt: string;
}

function fromServer(m: ServerMessage): ChatMessage {
  return {
    id: m.id,
    userId: m.userId,
    username: m.username,
    text: m.text,
    timestamp: new Date(m.createdAt).getTime(),
  };
}

const EASING = 'cubic-bezier(0.22,1,0.36,1)';

const AVATAR_GRADIENTS = [
  'linear-gradient(135deg, #ae89ff, #884efb)',
  'linear-gradient(135deg, #ff89ae, #fb4e88)',
  'linear-gradient(135deg, #89ffd4, #4efba5)',
  'linear-gradient(135deg, #ffde59, #fbae4e)',
];

function getAvatarGradient(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length];
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

let pendingCounter = 0;

export default function CoWorkChat({
  notebookId,
  sessionId,
  currentUserId,
  currentUsername,
}: CoWorkChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [hoveredToggle, setHoveredToggle] = useState(false);
  const [hoveredSend, setHoveredSend] = useState(false);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const socket = useCoworkSocket(sessionId);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Initial history load + defensive polling fallback. Real-time delivery
  // is via the cowork:message socket event, but a 5-second poll refreshes
  // the history so the chat stays accurate even if the socket drops a
  // broadcast. The fetch de-dupes by id, so new poll results never create
  // duplicates of messages we already have from the socket.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(
          `/api/notebooks/${notebookId}/cowork/${sessionId}/messages`
        );
        if (!res.ok) return;
        const json = await res.json();
        const list: ServerMessage[] = json.data?.messages || [];
        if (cancelled) return;
        setMessages((prev) => {
          // Build a Map of server messages by id.
          const byId = new Map<string, ChatMessage>();
          for (const m of list) byId.set(m.id, fromServer(m));
          for (const m of prev) {
            if (!m.pending && !byId.has(m.id)) byId.set(m.id, m);
          }

          // Only keep pending messages whose server twin has NOT yet
          // arrived. This used to be "always keep pending" which caused
          // every sent message to appear twice once the poll fetched the
          // persisted row (pending + server copy both in the list). The
          // ws-delivered de-dupe was the only path that cleared pending
          // before — if the socket wasn't joined to the room (or just
          // flaky), duplicates stuck around forever.
          const stillPending = prev.filter((m) => {
            if (!m.pending) return false;
            return !list.some(
              (sm) => sm.userId === m.userId && sm.text === m.text
            );
          });

          return [
            ...Array.from(byId.values()).sort(
              (a, b) => a.timestamp - b.timestamp
            ),
            ...stillPending,
          ];
        });
      } catch {
        // silent
      }
    };
    load();
    const interval = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [notebookId, sessionId]);

  // Real-time message subscription
  useEffect(() => {
    if (!socket) return;

    const onMessage = (m: ServerMessage) => {
      if (m.sessionId !== sessionId) return;
      setMessages((prev) => {
        // De-dupe: if the optimistic pending message is from the current
        // user with the same text, replace it with the persisted version.
        const idx = prev.findIndex(
          (p) =>
            p.pending &&
            p.userId === m.userId &&
            p.text === m.text
        );
        if (idx !== -1) {
          const next = prev.slice();
          next[idx] = fromServer(m);
          return next;
        }
        // Skip if we already have this id
        if (prev.some((p) => p.id === m.id)) return prev;
        return [...prev, fromServer(m)];
      });
    };

    socket.on('cowork:message', onMessage);
    return () => {
      socket.off('cowork:message', onMessage);
    };
  }, [socket, sessionId]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;

    // Optimistic append
    const pendingId = `pending-${++pendingCounter}`;
    setMessages((prev) => [
      ...prev,
      {
        id: pendingId,
        userId: currentUserId,
        username: currentUsername,
        text,
        timestamp: Date.now(),
        pending: true,
      },
    ]);
    setInput('');
    setSending(true);

    try {
      const res = await fetch(
        `/api/notebooks/${notebookId}/cowork/${sessionId}/messages`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        }
      );
      if (!res.ok) {
        // Drop the optimistic message on failure
        setMessages((prev) => prev.filter((m) => m.id !== pendingId));
      }
      // On success, the ws-server will broadcast the persisted message and
      // our `cowork:message` listener will swap the pending entry for the
      // server version. (Even if our own broadcast doesn't loop back, the
      // de-dupe path keeps the local entry visible — it just stays pending.)
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== pendingId));
    } finally {
      setSending(false);
    }
  }, [input, sending, currentUserId, currentUsername, notebookId, sessionId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      {/* Toggle Button */}
      <button
        onClick={() => setIsOpen((v) => !v)}
        onMouseEnter={() => setHoveredToggle(true)}
        onMouseLeave={() => setHoveredToggle(false)}
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          width: 48,
          height: 48,
          borderRadius: 14,
          border: 'none',
          background: isOpen
            ? '#ae89ff'
            : hoveredToggle
              ? 'rgba(174,137,255,0.2)'
              : 'rgba(174,137,255,0.12)',
          color: isOpen ? '#111126' : '#ae89ff',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: isOpen ? '0 8px 24px rgba(174,137,255,0.3)' : '0 4px 16px rgba(0,0,0,0.3)',
          transition: `all 0.2s ${EASING}`,
          zIndex: 1000,
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 22 }}>
          {isOpen ? 'close' : 'chat'}
        </span>
        {!isOpen && messages.length > 0 && (
          <span
            style={{
              position: 'absolute',
              top: -4,
              right: -4,
              width: 18,
              height: 18,
              borderRadius: 9,
              background: '#fd6f85',
              color: '#fff',
              fontSize: 9,
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '2px solid #111126',
            }}
          >
            {messages.length > 99 ? '99+' : messages.length}
          </span>
        )}
      </button>

      {/* Chat Panel */}
      {isOpen && (
        <div
          style={{
            position: 'fixed',
            bottom: 80,
            right: 24,
            width: 320,
            maxHeight: 440,
            background: '#161630',
            borderRadius: 20,
            border: '1px solid #555578',
            boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            zIndex: 1000,
            animation: 'chatPanelIn 0.25s cubic-bezier(0.22,1,0.36,1)',
            fontFamily: 'inherit',
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '14px 16px',
              borderBottom: '1px solid rgba(70,69,96,0.4)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#ae89ff' }}>
              forum
            </span>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#e5e3ff' }}>Session Chat</span>
            <span
              style={{
                fontSize: 9,
                color: socket?.connected ? '#4ade80' : '#8888a8',
                marginLeft: 'auto',
                fontWeight: 600,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
              }}
            >
              {socket?.connected ? '● live' : '○ offline'}
            </span>
          </div>

          {/* Messages */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '12px 12px 8px',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              minHeight: 200,
            }}
          >
            {messages.length === 0 && (
              <div
                style={{
                  textAlign: 'center',
                  padding: '40px 16px',
                  color: '#8888a8',
                  fontSize: 12,
                }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 28, display: 'block', marginBottom: 8, opacity: 0.4 }}
                >
                  chat_bubble
                </span>
                No messages yet
              </div>
            )}
            {messages.map((msg) => {
              const isOwn = msg.userId === currentUserId;
              return (
                <div
                  key={msg.id}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: isOwn ? 'flex-end' : 'flex-start',
                  }}
                >
                  {!isOwn && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                      <div
                        style={{
                          width: 18,
                          height: 18,
                          borderRadius: 6,
                          background: getAvatarGradient(msg.userId),
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 8,
                          fontWeight: 700,
                          color: '#fff',
                        }}
                      >
                        {msg.username[0].toUpperCase()}
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 600, color: '#aaa8c8' }}>
                        {msg.username}
                      </span>
                    </div>
                  )}
                  <div
                    style={{
                      maxWidth: '85%',
                      padding: '8px 12px',
                      borderRadius: isOwn ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                      background: isOwn
                        ? 'linear-gradient(135deg, rgba(174,137,255,0.2), rgba(136,78,251,0.2))'
                        : '#232342',
                      fontSize: 13,
                      color: '#e5e3ff',
                      lineHeight: 1.5,
                      wordBreak: 'break-word',
                    }}
                  >
                    {msg.text}
                  </div>
                  <span
                    style={{
                      fontSize: 9,
                      color: 'rgba(115,115,144,0.5)',
                      marginTop: 2,
                      padding: '0 4px',
                    }}
                  >
                    {formatTime(msg.timestamp)}
                  </span>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div
            style={{
              padding: '10px 12px 12px',
              borderTop: '1px solid rgba(70,69,96,0.4)',
              display: 'flex',
              gap: 8,
              alignItems: 'flex-end',
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message…"
              style={{
                flex: 1,
                padding: '9px 14px',
                borderRadius: 12,
                border: 'none',
                background: '#2a2a4c',
                color: '#e5e3ff',
                fontSize: 13,
                fontFamily: 'inherit',
                outline: 'none',
              }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              onMouseEnter={() => setHoveredSend(true)}
              onMouseLeave={() => setHoveredSend(false)}
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                border: 'none',
                background: input.trim()
                  ? hoveredSend
                    ? 'linear-gradient(135deg, #c4a6ff, #9b5fff)'
                    : 'linear-gradient(135deg, #ae89ff, #884efb)'
                  : '#2a2a4c',
                color: input.trim() ? '#fff' : '#8888a8',
                cursor: input.trim() ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                transition: `all 0.15s ${EASING}`,
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                send
              </span>
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes chatPanelIn {
          from { opacity: 0; transform: translateY(12px) scale(0.96); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </>
  );
}
