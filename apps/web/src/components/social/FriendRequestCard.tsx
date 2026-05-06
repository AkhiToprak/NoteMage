'use client';

import React, { useState } from 'react';
import { UserName } from '@/components/user/UserName';
import { UserAvatar } from '@/components/user/UserAvatar';

interface FriendRequestCardProps {
  friendshipId: string;
  user: {
    id: string;
    username: string;
    name?: string | null;
    avatarUrl?: string | null;
    nameStyle?: { fontId?: string; colorId?: string } | null;
    equippedFrameId?: string | null;
    equippedTitleId?: string | null;
  };
  createdAt: string;
  onAccept: (friendshipId: string) => void;
  onDecline: (friendshipId: string) => void;
  loading?: boolean;
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

export default function FriendRequestCard({
  friendshipId,
  user,
  createdAt,
  onAccept,
  onDecline,
  loading = false,
}: FriendRequestCardProps) {
  const [hovered, setHovered] = useState(false);
  const [acceptHovered, setAcceptHovered] = useState(false);
  const [declineHovered, setDeclineHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: '12px 16px',
        borderRadius: 12,
        background: hovered ? '#35355c' : '#2d2d52',
        transition: 'background 0.2s cubic-bezier(0.22,1,0.36,1)',
      }}
    >
      {/* Avatar */}
      <UserAvatar user={user} size={40} radius="50%" />

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            flexWrap: 'wrap',
          }}
        >
          <UserName
            user={user}
            preferUsername
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: '#e5e3ff',
              lineHeight: 1.3,
              maxWidth: '100%',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          />
          <span
            style={{
              fontSize: 12,
              color: '#8888a8',
              lineHeight: 1.3,
              whiteSpace: 'nowrap',
            }}
          >
            {timeAgo(createdAt)}
          </span>
        </div>
        {user.name && (
          <div
            style={{
              fontSize: 12,
              color: '#aaa8c8',
              lineHeight: 1.4,
              marginTop: 2,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {user.name}
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        {/* Accept */}
        <button
          type="button"
          disabled={loading}
          onClick={() => onAccept(friendshipId)}
          onMouseEnter={() => setAcceptHovered(true)}
          onMouseLeave={() => setAcceptHovered(false)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 34,
            height: 34,
            borderRadius: 8,
            border: '1px solid rgba(74,222,128,0.3)',
            background: acceptHovered ? 'rgba(74,222,128,0.25)' : 'rgba(74,222,128,0.15)',
            color: '#4ade80',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.6 : 1,
            transition:
              'background 0.2s cubic-bezier(0.22,1,0.36,1), opacity 0.2s cubic-bezier(0.22,1,0.36,1)',
            padding: 0,
            outline: 'none',
          }}
          aria-label="Accept friend request"
        >
          <span
            className="material-symbols-outlined"
            style={{
              fontSize: 20,
              animation: loading ? 'spin 1s linear infinite' : 'none',
            }}
          >
            {loading ? 'progress_activity' : 'check'}
          </span>
        </button>

        {/* Decline */}
        <button
          type="button"
          disabled={loading}
          onClick={() => onDecline(friendshipId)}
          onMouseEnter={() => setDeclineHovered(true)}
          onMouseLeave={() => setDeclineHovered(false)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 34,
            height: 34,
            borderRadius: 8,
            border: '1px solid rgba(253,111,133,0.3)',
            background: declineHovered ? 'rgba(253,111,133,0.25)' : 'rgba(253,111,133,0.15)',
            color: '#fd6f85',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.6 : 1,
            transition:
              'background 0.2s cubic-bezier(0.22,1,0.36,1), opacity 0.2s cubic-bezier(0.22,1,0.36,1)',
            padding: 0,
            outline: 'none',
          }}
          aria-label="Decline friend request"
        >
          <span
            className="material-symbols-outlined"
            style={{
              fontSize: 20,
              animation: loading ? 'spin 1s linear infinite' : 'none',
            }}
          >
            {loading ? 'progress_activity' : 'close'}
          </span>
        </button>
      </div>
    </div>
  );
}
