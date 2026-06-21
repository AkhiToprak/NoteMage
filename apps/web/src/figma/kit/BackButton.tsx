'use client';

import type { CSSProperties } from 'react';
import styles from './kit.module.css';

export interface BackButtonProps {
  onClick?: () => void;
  /** Material Symbols glyph (chevron by default). */
  icon?: string;
  label?: string;
  style?: CSSProperties;
}

/** Circular ghost back button used in screen headers. */
export function BackButton({
  onClick,
  icon = 'arrow_back',
  label = 'Back',
  style,
}: BackButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={styles.chip}
      style={{
        width: 44,
        height: 44,
        padding: 0,
        justifyContent: 'center',
        borderRadius: 'var(--radius-full)',
        background: 'var(--surface-container-high)',
        ...style,
      }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 22 }}>
        {icon}
      </span>
    </button>
  );
}
