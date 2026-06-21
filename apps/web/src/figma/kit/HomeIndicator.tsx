'use client';

import type { CSSProperties } from 'react';

export interface HomeIndicatorProps {
  /** Color of the pill (defaults to current ink). */
  color?: string;
  style?: CSSProperties;
}

/** The iOS home-indicator pill at the bottom of the mobile frames. */
export function HomeIndicator({ color, style }: HomeIndicatorProps) {
  return (
    <div
      aria-hidden
      style={{
        height: 34,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flex: '0 0 auto',
        ...style,
      }}
    >
      <span
        style={{
          width: 134,
          height: 5,
          borderRadius: 'var(--radius-full)',
          background: color ?? 'var(--on-surface)',
          opacity: 0.85,
        }}
      />
    </div>
  );
}
