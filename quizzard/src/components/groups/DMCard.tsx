'use client';

import React, { useState } from 'react';

const COLORS = {
  cardBg: '#161630',
  elevated: '#232342',
  primary: '#ae89ff',
  deepPurple2: '#8348f6',
  textPrimary: '#e5e3ff',
  textMuted: '#8888a8',
} as const;

const EASING = 'cubic-bezier(0.22,1,0.36,1)';

interface DMUser {
  id: string;
  name: string | null;
  username: string;
  avatarUrl: string | null;
}

interface Props {
  otherUser: DMUser;
  hasUnread?: boolean;
  onClick: () => void;
}

export default function DMCard({ otherUser, hasUnread, onClick }: Props) {
  const [hovered, setHovered] = useState(false);
  const initial = (otherUser.name?.[0] || otherUser.username[0] || '?').toUpperCase();

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 16,
        padding: '16px 20px', borderRadius: 14,
        background: hovered ? COLORS.elevated : COLORS.cardBg,
        cursor: 'pointer',
        transition: `background 0.2s ${EASING}, transform 0.15s ${EASING}`,
        transform: hovered ? 'translateX(4px)' : 'translateX(0)',
      }}
    >
      {otherUser.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={otherUser.avatarUrl} alt="" style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
      ) : (
        <div style={{
          width: 44, height: 44, borderRadius: '50%',
          background: `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.deepPurple2})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 18, fontWeight: 700, color: '#fff', flexShrink: 0,
        }}>
          {initial}
        </div>
      )}
      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: 15, fontWeight: 700, color: COLORS.textPrimary, margin: 0 }}>
          {otherUser.name || otherUser.username}
        </p>
        <p style={{ fontSize: 12, color: COLORS.textMuted, margin: 0, marginTop: 2 }}>
          @{otherUser.username}
        </p>
      </div>
      {hasUnread && (
        <div style={{
          width: 8, height: 8, borderRadius: '50%',
          background: COLORS.primary,
          boxShadow: `0 0 8px ${COLORS.primary}cc`,
          marginLeft: 'auto', flexShrink: 0,
        }} />
      )}
      <span className="material-symbols-outlined" style={{ marginLeft: hasUnread ? 8 : 'auto', fontSize: 20, color: COLORS.textMuted, opacity: hovered ? 1 : 0.4, transition: `opacity 0.2s ${EASING}` }}>
        chevron_right
      </span>
    </div>
  );
}
