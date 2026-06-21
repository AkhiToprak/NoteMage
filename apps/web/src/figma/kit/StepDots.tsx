'use client';

import type { CSSProperties } from 'react';
import styles from './kit.module.css';
import { FProgress } from './FProgress';

export interface StepDotsProps {
  /** Total steps. */
  count: number;
  /** Active step index (0-based). */
  active: number;
  /** 'dots' = pill-dots (active dot widens); 'bar' = single progress bar. */
  variant?: 'dots' | 'bar';
  style?: CSSProperties;
}

/** Onboarding progress — dot row (active widens to a pill) or a progress bar. */
export function StepDots({ count, active, variant = 'dots', style }: StepDotsProps) {
  if (variant === 'bar') {
    const pct = count <= 1 ? 100 : ((active + 1) / count) * 100;
    return <FProgress value={pct} height={8} label={`Step ${active + 1} of ${count}`} style={style} />;
  }
  return (
    <div
      role="progressbar"
      aria-valuenow={active + 1}
      aria-valuemin={1}
      aria-valuemax={count}
      aria-label={`Step ${active + 1} of ${count}`}
      style={{ display: 'flex', alignItems: 'center', gap: 6, ...style }}
    >
      {Array.from({ length: count }, (_, i) => {
        const isActive = i === active;
        return (
          <span
            key={i}
            className={[styles.dot, isActive ? styles.dotActive : null].filter(Boolean).join(' ')}
            style={{ width: isActive ? 24 : 8 }}
          />
        );
      })}
    </div>
  );
}
