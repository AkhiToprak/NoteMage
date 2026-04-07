'use client';

import React, { useRef, useEffect } from 'react';
import { useGroupChat } from '@/hooks/useGroupChat';
import GroupChatMessage from './GroupChatMessage';
import GroupChatInput from './GroupChatInput';

const COLORS = {
  pageBg: '#111126',
  cardBg: '#161630',
  elevated: '#232342',
  primary: '#ae89ff',
  textPrimary: '#e5e3ff',
  textSecondary: '#aaa8c8',
  textMuted: '#8888a8',
  border: '#555578',
} as const;

const EASING = 'cubic-bezier(0.22,1,0.36,1)';

interface Props {
  groupId: string;
  currentUserId: string;
}

function LoadingSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: '24px 0' }}>
      {[1, 2, 3, 4].map((i) => (
        <div key={i} style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexDirection: i % 2 === 0 ? 'row-reverse' : 'row', maxWidth: '60%', marginLeft: i % 2 === 0 ? 'auto' : 0 }}>
          <div className="groups-skeleton" style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0 }} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="groups-skeleton" style={{ width: 100, height: 14, borderRadius: 6 }} />
            <div className="groups-skeleton" style={{ width: '100%', height: 48, borderRadius: 16 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function GroupChat({ groupId, currentUserId }: Props) {
  const { messages, loading, sending, hasMore, loadMore, sendMessage } = useGroupChat(groupId);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const wasAtBottomRef = useRef(true);

  // Auto-scroll to bottom on new messages (only if user was already at bottom)
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    if (wasAtBottomRef.current) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages.length]);

  const handleScroll = () => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const atBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 60;
    wasAtBottomRef.current = atBottom;
  };

  // Messages are stored newest-first, reverse for display (oldest at top)
  const displayMessages = [...messages].reverse();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Message list */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="custom-scrollbar"
        style={{
          flex: 1, overflowY: 'auto',
          padding: '24px 24px 16px',
          display: 'flex', flexDirection: 'column', gap: 20,
        }}
      >
        {/* Load more button */}
        {hasMore && !loading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0' }}>
            <button
              onClick={loadMore}
              style={{
                background: COLORS.elevated, border: 'none', borderRadius: 9999,
                padding: '8px 20px', fontSize: 12, fontWeight: 600,
                color: COLORS.textSecondary, cursor: 'pointer', fontFamily: 'inherit',
                transition: `transform 0.2s ${EASING}`,
              }}
              onMouseEnter={(e) => { (e.currentTarget).style.transform = 'scale(1.05)'; }}
              onMouseLeave={(e) => { (e.currentTarget).style.transform = 'scale(1)'; }}
            >
              Load older messages
            </button>
          </div>
        )}

        {loading && displayMessages.length === 0 && <LoadingSkeleton />}

        {!loading && displayMessages.length === 0 && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: COLORS.textMuted }}>
            <span className="material-symbols-outlined" style={{ fontSize: 48, opacity: 0.4 }}>chat_bubble_outline</span>
            <p style={{ fontSize: 14, fontWeight: 500 }}>No messages yet. Start the conversation!</p>
          </div>
        )}

        {displayMessages.map((msg) => (
          <GroupChatMessage
            key={msg.id}
            message={msg}
            isOwn={msg.senderId === currentUserId}
          />
        ))}
      </div>

      {/* Input */}
      <GroupChatInput onSend={(content) => sendMessage(content)} sending={sending} />

      <style>{`
        .groups-skeleton {
          background: linear-gradient(90deg, ${COLORS.cardBg} 25%, ${COLORS.elevated} 50%, ${COLORS.cardBg} 75%);
          background-size: 200% 100%;
          animation: shimmer 1.5s infinite;
        }
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}
