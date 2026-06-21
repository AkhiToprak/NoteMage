'use client';

import type { CSSProperties } from 'react';
import styles from './kit.module.css';

export interface FProgressProps {
  /** 0–100. */
  value: number;
  /** Fill color (defaults to --nm-primary). */
  color?: string;
  /** Track height in px. */
  height?: number;
  /** Accessible label. */
  label?: string;
  style?: CSSProperties;
}

/**
 * Kit progress bar. The fill scales via `transform: scaleX` (not width) so the
 * animation stays on the compositor and honors the transform-only motion rule.
 */
export function FProgress({ value, color, height = 10, label, style }: FProgressProps) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      className={styles.progressTrack}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      style={{ height, ...style }}
    >
      <div
        className={styles.progressFill}
        style={{
          width: '100%',
          transform: `scaleX(${pct / 100})`,
          ...(color ? { background: color } : null),
        }}
      />
    </div>
  );
}
