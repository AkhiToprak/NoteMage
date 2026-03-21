'use client';

import { useState, useRef, useEffect } from 'react';

interface ChatMessage {
  id: string;
  userId: string;
  username: string;
  text: string;
  timestamp: number;
}

interface CoWorkChatProps {
  currentUserId: string;
  currentUsername: string;
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

let msgCounter = 0;

export default function CoWorkChat({ currentUserId, currentUsername }: CoWorkChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [hoveredToggle, setHoveredToggle] = useState(false);
  const [hoveredSend, setHoveredSend] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;

    setMessages((prev) => [
      ...prev,
      {
        id: `msg-${++msgCounter}`,
        userId: currentUserId,
        username: currentUsername,
        text,
        timestamp: Date.now(),
      },
    ]);
    setInput('');
  };

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
          color: isOpen ? '#0d0d1a' : '#ae89ff',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: isOpen
            ? '0 8px 24px rgba(174,137,255,0.3)'
            : '0 4px 16px rgba(0,0,0,0.3)',
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
              border: '2px solid #0d0c20',
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
            background: '#121222',
            borderRadius: 20,
            border: '1px solid #464560',
            boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            zIndex: 1000,
            animation: 'chatPanelIn 0.25s cubic-bezier(0.22,1,0.36,1)',
            fontFamily: "'DM Sans', sans-serif",
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
            <span
              className="material-symbols-outlined"
              style={{ fontSize: 18, color: '#ae89ff' }}
            >
              forum
            </span>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#e5e3ff' }}>
              Session Chat
            </span>
            <span
              style={{
                fontSize: 10,
                color: '#737390',
                marginLeft: 'auto',
                fontStyle: 'italic',
              }}
            >
              In-memory only
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
                  color: '#737390',
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
                        : '#1d1d33',
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
                background: '#23233c',
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
                  : '#23233c',
                color: input.trim() ? '#fff' : '#737390',
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
