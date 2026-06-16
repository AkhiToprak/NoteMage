import * as React from 'react';

export type DifficultyLevel = 'easy' | 'medium' | 'hard';
export type DifficultySize = 'sm' | 'md';

export interface DifficultyBadgeProps {
  level: DifficultyLevel;
  size?: DifficultySize;
}

interface LevelConfig {
  label: string;
  bg: string;
  color: string;
}

const LEVEL_CONFIG: Record<DifficultyLevel, LevelConfig> = {
  easy: {
    label: 'Easy',
    bg: 'var(--nm-complete-soft)',
    color: 'var(--nm-complete)',
  },
  medium: {
    label: 'Medium',
    bg: 'var(--nm-review-soft)',
    color: 'var(--nm-review)',
  },
  hard: {
    label: 'Hard',
    bg: 'var(--nm-boss-soft)',
    color: 'var(--nm-boss)',
  },
};

export function DifficultyBadge({ level, size = 'md' }: DifficultyBadgeProps) {
  const { label, bg, color } = LEVEL_CONFIG[level];
  const isSm = size === 'sm';

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        borderRadius: 'var(--radius-full)',
        padding: isSm ? '2px 8px' : '4px 10px',
        background: bg,
        color,
        border: `1px solid color-mix(in srgb, ${color} 35%, transparent)`,
        fontSize: 'var(--fs-xs)',
        fontWeight: 600,
        fontFamily: 'var(--font-sans)',
        lineHeight: 1,
        whiteSpace: 'nowrap',
        userSelect: 'none',
      }}
    >
      <span
        aria-hidden
        style={{
          display: 'inline-block',
          width: isSm ? 5 : 6,
          height: isSm ? 5 : 6,
          borderRadius: '50%',
          background: color,
          flexShrink: 0,
        }}
      />
      {label}
    </span>
  );
}

export default DifficultyBadge;
