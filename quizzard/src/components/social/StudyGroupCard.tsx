'use client';

import React, { useState } from 'react';

interface StudyGroupCardProps {
  group: {
    id: string;
    name: string;
    description: string | null;
    _count: { members: number; notebooks: number };
  };
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

export default function StudyGroupCard({ group, onClick }: StudyGroupCardProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? COLORS.elevated : COLORS.cardBg,
        borderRadius: 16,
        padding: 24,
        cursor: 'pointer',
        border: `1px solid ${hovered ? COLORS.primary + '44' : COLORS.border}`,
        transition: `background 0.2s ${EASING}, border-color 0.2s ${EASING}, transform 0.2s ${EASING}, box-shadow 0.2s ${EASING}`,
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
        boxShadow: hovered
          ? '0 8px 32px rgba(140, 82, 255, 0.12)'
          : '0 2px 8px rgba(0, 0, 0, 0.2)',
        display: 'flex',
        flexDirection: 'column' as const,
        gap: 12,
        minHeight: 140,
      }}
    >
      <div
        style={{
          fontSize: 17,
          fontWeight: 700,
          color: COLORS.textPrimary,
          letterSpacing: '-0.01em',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {group.name}
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
            auto_stories
          </span>
          {group._count.notebooks}
        </div>
      </div>
    </div>
  );
}
