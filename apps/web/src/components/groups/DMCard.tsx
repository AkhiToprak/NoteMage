'use client';

import React, { useState } from 'react';
import { UserAvatar } from '@/components/user/UserAvatar';
import { UserName } from '@/components/user/UserName';

const COLORS = {
  cardBg: '#21213e',
  elevated: '#2d2d52',
  primary: '#ae89ff',
  textPrimary: '#e5e3ff',
  textMuted: '#8888a8',
} as const;

const EASING = 'cubic-bezier(0.22,1,0.36,1)';

/**
 * Shape of the peer user this card paints. Cosmetic fields are optional so
 * existing call sites don't break — but any caller that can provide them
 * (see `/api/groups`, which forwards them now) should, so the list entry
 * picks up the peer's equipped frame / title / name font.
 */
interface DMUser {
  id: string;
  name: string | null;
  username: string;
  avatarUrl: string | null;
  nameStyle?: { fontId?: string; colorId?: string } | null;
  equippedFrameId?: string | null;
  equippedTitleId?: string | null;
}

interface Props {
  otherUser: DMUser;
  hasUnread?: boolean;
  onClick: () => void;
}

export default function DMCard({ otherUser, hasUnread, onClick }: Props) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '16px 20px',
        borderRadius: 14,
        background: hovered ? COLORS.elevated : COLORS.cardBg,
        cursor: 'pointer',
        transition: `background 0.2s ${EASING}, transform 0.15s ${EASING}`,
        transform: hovered ? 'translateX(4px)' : 'translateX(0)',
      }}
    >
      {/* Route through UserAvatar so equipped frames (glow/pulse/prism)
          render just like the rest of the app. Circular to match the
          previous DMCard look. */}
      <UserAvatar user={otherUser} size={44} radius="50%" />

      <div style={{ minWidth: 0, flex: 1 }}>
        <UserName
          user={otherUser}
          showTitle
          as="p"
          style={{
            fontSize: 15,
            fontWeight: 700,
            color: COLORS.textPrimary,
            margin: 0,
          }}
        />
        <p
          style={{
            fontSize: 12,
            color: COLORS.textMuted,
            margin: 0,
            marginTop: 2,
          }}
        >
          @{otherUser.username}
        </p>
      </div>
      {hasUnread && (
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: COLORS.primary,
            boxShadow: `0 0 8px ${COLORS.primary}cc`,
            flexShrink: 0,
          }}
        />
      )}
      <span
        className="material-symbols-outlined"
        style={{
          marginLeft: hasUnread ? 8 : 0,
          fontSize: 20,
          color: COLORS.textMuted,
          opacity: hovered ? 1 : 0.4,
          transition: `opacity 0.2s ${EASING}`,
          flexShrink: 0,
        }}
      >
        chevron_right
      </span>
    </div>
  );
}
