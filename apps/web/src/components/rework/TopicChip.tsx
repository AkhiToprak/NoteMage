'use client';

import * as React from 'react';

export interface TopicChipProps {
  label: string;
  onRemove?: () => void;
}

export function TopicChip({ label, onRemove }: TopicChipProps) {
  const [closeHovered, setCloseHovered] = React.useState(false);

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        borderRadius: 'var(--radius-full)',
        padding: onRemove ? '6px 4px 6px 14px' : '6px 14px',
        background: 'var(--nm-primary-light)',
        color: 'var(--nm-primary-on-light)',
        border: `1px solid color-mix(in srgb, var(--nm-primary) 30%, transparent)`,
        fontSize: 'var(--fs-sm)',
        fontWeight: 600,
        fontFamily: 'var(--font-sans)',
        whiteSpace: 'nowrap',
        flexShrink: 0,
        userSelect: 'none',
      }}
    >
      <span>{label}</span>
      {onRemove && (
        <button
          type="button"
          aria-label={`Remove ${label}`}
          onClick={onRemove}
          onMouseEnter={() => setCloseHovered(true)}
          onMouseLeave={() => setCloseHovered(false)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 24,
            height: 24,
            borderRadius: '50%',
            border: 'none',
            background: closeHovered
              ? 'color-mix(in srgb, var(--nm-primary) 18%, transparent)'
              : 'transparent',
            color: 'var(--nm-primary-on-light)',
            cursor: 'pointer',
            padding: 0,
            flexShrink: 0,
            transition: `background var(--dur-fast), transform var(--dur-fast)`,
            outline: 'none',
            WebkitTapHighlightColor: 'transparent',
          }}
          onFocus={(e) => {
            if (e.target.matches(':focus-visible')) {
              (e.target as HTMLButtonElement).style.outline = '3px solid var(--accent-strong)';
              (e.target as HTMLButtonElement).style.outlineOffset = '2px';
            }
          }}
          onBlur={(e) => {
            (e.target as HTMLButtonElement).style.outline = 'none';
            (e.target as HTMLButtonElement).style.outlineOffset = '0';
          }}
        >
          <span
            className="material-symbols-outlined"
            aria-hidden
            style={{ fontSize: 16, lineHeight: 1 }}
          >
            close
          </span>
        </button>
      )}
    </span>
  );
}

export default TopicChip;
