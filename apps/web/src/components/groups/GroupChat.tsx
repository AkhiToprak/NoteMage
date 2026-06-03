'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useGroupChat } from '@/hooks/useGroupChat';
import GroupChatMessage from './GroupChatMessage';
import GroupChatInput from './GroupChatInput';
import ShareContentModal from './ShareContentModal';
import StartCoworkModal from '@/components/cowork/StartCoworkModal';
import type { CoworkInvitePayload } from '@/lib/cowork-join';

const COLORS = {
  pageBg: 'var(--background)',
  cardBg: 'var(--surface-container)',
  elevated: 'var(--surface-container-high)',
  primary: '#ae89ff',
  textPrimary: 'var(--on-surface)',
  textSecondary: 'var(--on-surface-variant)',
  textMuted: 'var(--outline)',
  border: 'var(--outline-variant)',
} as const;

const EASING = 'cubic-bezier(0.22,1,0.36,1)';

interface Props {
  groupId: string;
  groupName: string;
  currentUserId: string;
  canChat?: boolean;
  isDirectMessage?: boolean;
}

function LoadingSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: '24px 0' }}>
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            gap: 16,
            alignItems: 'flex-start',
            flexDirection: i % 2 === 0 ? 'row-reverse' : 'row',
            maxWidth: '60%',
            marginLeft: i % 2 === 0 ? 'auto' : 0,
          }}
        >
          <div
            className="groups-skeleton"
            style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0 }}
          />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="groups-skeleton" style={{ width: 100, height: 14, borderRadius: 6 }} />
            <div
              className="groups-skeleton"
              style={{ width: '100%', height: 48, borderRadius: 16 }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function GroupChat({
  groupId,
  groupName,
  currentUserId,
  canChat = true,
  isDirectMessage = false,
}: Props) {
  const { messages, loading, sending, hasMore, loadMore, sendMessage } = useGroupChat(groupId);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [startCoworkOpen, setStartCoworkOpen] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const wasAtBottomRef = useRef(true);

  // When StartCoworkModal finishes creating a session, post the invite
  // card as a structured chat message so every member sees it.
  const handleCoworkCreated = useCallback(
    (payload: CoworkInvitePayload) => {
      const content = `Started a co-work session on "${payload.pageTitle}"`;
      sendMessage(content, 'cowork_invite', payload);
    },
    [sendMessage]
  );

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
          flex: 1,
          overflowY: 'auto',
          padding: '24px 24px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
        }}
      >
        {/* Load more button */}
        {hasMore && !loading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0' }}>
            <button
              onClick={loadMore}
              style={{
                background: COLORS.elevated,
                border: 'none',
                borderRadius: 9999,
                padding: '8px 20px',
                fontSize: 12,
                fontWeight: 600,
                color: COLORS.textSecondary,
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: `transform 0.2s ${EASING}`,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.05)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
              }}
            >
              Load older messages
            </button>
          </div>
        )}

        {loading && displayMessages.length === 0 && <LoadingSkeleton />}

        {!loading && displayMessages.length === 0 && (
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              color: COLORS.textMuted,
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 48, opacity: 0.4 }}>
              chat_bubble_outline
            </span>
            <p style={{ fontSize: 14, fontWeight: 500 }}>
              No messages yet. Start the conversation!
            </p>
          </div>
        )}

        {displayMessages.map((msg) => (
          <GroupChatMessage
            key={msg.id}
            message={msg}
            groupId={groupId}
            currentUserId={currentUserId}
            isOwn={msg.senderId === currentUserId}
            isDirectMessage={isDirectMessage}
          />
        ))}
      </div>

      {/* Input */}
      {canChat ? (
        <GroupChatInput
          onSend={(content) => sendMessage(content)}
          sending={sending}
          onShareClick={() => setShareModalOpen(true)}
          onStartCoworkClick={() => setStartCoworkOpen(true)}
        />
      ) : (
        <div
          style={{
            padding: '16px 24px',
            textAlign: 'center',
            background: `color-mix(in srgb, ${COLORS.elevated} 90%, transparent)`,
            borderTop: `1px solid color-mix(in srgb, ${COLORS.border} 10%, transparent)`,
            color: COLORS.textMuted,
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: 16, verticalAlign: 'middle', marginRight: 6 }}
          >
            lock
          </span>
          Chat is restricted by the teacher
        </div>
      )}

      <ShareContentModal
        open={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        groupId={groupId}
        groupName={groupName}
        onShared={() => setShareModalOpen(false)}
      />

      <StartCoworkModal
        open={startCoworkOpen}
        onClose={() => setStartCoworkOpen(false)}
        groupId={groupId}
        groupName={groupName}
        currentUserId={currentUserId}
        onCreated={handleCoworkCreated}
      />

      <style>{`
        .groups-skeleton {
          background: ${COLORS.elevated};
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
