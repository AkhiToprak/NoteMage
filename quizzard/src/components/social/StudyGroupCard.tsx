'use client';

import React, { useState } from 'react';

interface StudyGroupCardProps {
  group: {
    id: string;
    name: string;
    description: string | null;
    avatarUrl?: string | null;
    _count: { members: number; notebooks: number };
  };
  hasUnread?: boolean;
  onClick?: () => void;
}

const COLORS = {
  cardBg: '#161630',
  elevated: '#232342',
  primary: '#ae89ff',
  textPrimary: '#e5e3ff',
  textSecondary: '#aaa8c8',
  textMuted: '#8888a8',
  border: '#555578',
} as const;

const EASING = 'cubic-bezier(0.22,1,0.36,1)';

export default function StudyGroupCard({ group, hasUnread, onClick }: StudyGroupCardProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative' as const,
        background: hovered ? COLORS.elevated : COLORS.cardBg,
        borderRadius: 16,
        padding: 24,
        cursor: 'pointer',
        border: `1px solid ${hovered ? COLORS.primary + '44' : COLORS.border}`,
        transition: `background 0.2s ${EASING}, border-color 0.2s ${EASING}, transform 0.2s ${EASING}, box-shadow 0.2s ${EASING}`,
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
        boxShadow: hovered ? '0 8px 32px rgba(140, 82, 255, 0.12)' : '0 2px 8px rgba(0, 0, 0, 0.2)',
        display: 'flex',
        flexDirection: 'column' as const,
        gap: 12,
        minHeight: 140,
      }}
    >
      {hasUnread && (
        <div style={{
          position: 'absolute', top: 12, right: 12,
          width: 8, height: 8, borderRadius: '50%',
          background: COLORS.primary,
          boxShadow: `0 0 8px ${COLORS.primary}cc`,
        }} />
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {group.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={group.avatarUrl}
            alt=""
            style={{ width: 40, height: 40, borderRadius: 12, objectFit: 'cover', flexShrink: 0 }}
          />
        ) : (
          <div style={{
            width: 40, height: 40, borderRadius: 12, flexShrink: 0,
            background: `linear-gradient(135deg, ${COLORS.primary}, #8348f6)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, fontWeight: 700, color: '#fff',
          }}>
            {group.name[0]?.toUpperCase() || '?'}
          </div>
        )}
        <div style={{
          fontSize: 17, fontWeight: 700, color: COLORS.textPrimary,
          letterSpacing: '-0.01em', overflow: 'hidden',
          textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0,
        }}>
          {group.name}
        </div>
      </div>

      {group.description && (
        <div
          style={{
            fontSize: 13,
            color: COLORS.textSecondary,
            lineHeight: 1.5,
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical' as const,
            flex: 1,
          }}
        >
          {group.description}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          marginTop: 'auto',
          paddingTop: 8,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            fontSize: 12,
            color: COLORS.textMuted,
            fontWeight: 500,
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
            group
          </span>
          {group._count.members}
        </div>
      </div>
    </div>
  );
}
