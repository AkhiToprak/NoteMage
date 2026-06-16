'use client';

import * as React from 'react';
import { Mascot } from '@/components/mascot/Mascot';
import styles from './CelebrationToast.module.css';

export interface CelebrationToastProps {
  title: string;
  message: string;
  onClose?: () => void;
  visible?: boolean;
  style?: React.CSSProperties;
}

export function CelebrationToast({
  title,
  message,
  onClose,
  visible = true,
  style,
}: CelebrationToastProps) {
  if (!visible) return null;

  return (
    <div
      className={styles.toast}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 'var(--space-3)',
        maxWidth: 360,
        background: 'var(--surface)',
        border: '1px solid var(--rule-hairline)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--bento-rest-shadow)',
        padding: 'var(--space-4)',
        ...style,
      }}
    >
      {/* Mascot */}
      <Mascot pose="graduation" size="sm" oneShot="cheer-big" idle="none" />

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            margin: 0,
            fontWeight: 700,
            fontSize: 'var(--fs-base)',
            color: 'var(--on-surface)',
            fontFamily: 'var(--font-sans)',
            lineHeight: 1.3,
          }}
        >
          {title}
        </p>
        <p
          style={{
            margin: '4px 0 0',
            fontSize: 'var(--fs-sm)',
            color: 'var(--on-surface-variant)',
            fontFamily: 'var(--font-sans)',
            lineHeight: 1.5,
          }}
        >
          {message}
        </p>
      </div>

      {/* Close */}
      {onClose && (
        <button
          type="button"
          aria-label="Close notification"
          onClick={onClose}
          className={styles.closeButton}
        >
          <span
            className="material-symbols-outlined"
            aria-hidden
            style={{ fontSize: 18, lineHeight: 1 }}
          >
            close
          </span>
        </button>
      )}
    </div>
  );
}

export default CelebrationToast;
