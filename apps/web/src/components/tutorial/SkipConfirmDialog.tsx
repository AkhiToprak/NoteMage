'use client';

import { useEffect, useState } from 'react';

interface Props {
  onConfirm: () => void;
  onCancel: () => void;
}

export function SkipConfirmDialog({ onConfirm, onCancel }: Props) {
  const [opacity, setOpacity] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read media query once on mount
      setReduceMotion(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    }
    const id = requestAnimationFrame(() => setOpacity(1));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCancel();
      } else if (e.key === 'Enter') {
        e.stopPropagation();
        onConfirm();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onCancel, onConfirm]);

  return (
    <div
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="tutorial-skip-confirm-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1200,
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(2px)',
        WebkitBackdropFilter: 'blur(2px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 'max(16px, env(safe-area-inset-top, 0px))',
        paddingBottom: 'max(16px, env(safe-area-inset-bottom, 0px))',
        paddingLeft: 'max(16px, env(safe-area-inset-left, 0px))',
        paddingRight: 'max(16px, env(safe-area-inset-right, 0px))',
        opacity,
        transition: reduceMotion
          ? 'none'
          : 'opacity 0.25s cubic-bezier(0.22, 1, 0.36, 1)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--surface-container)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--outline-variant)',
          padding: 24,
          width: '100%',
          maxWidth: 360,
          boxShadow: '0 24px 48px rgba(0,0,0,0.5)',
          transform: opacity === 0 ? 'translateY(8px)' : 'translateY(0)',
          transition: reduceMotion
            ? 'none'
            : 'transform 0.25s cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        <h3
          id="tutorial-skip-confirm-title"
          style={{
            margin: '0 0 8px',
            fontFamily: 'var(--font-display)',
            fontSize: 18,
            fontWeight: 700,
            color: 'var(--on-surface)',
            letterSpacing: '-0.01em',
          }}
        >
          Skip the tour?
        </h3>
        <p
          style={{
            margin: '0 0 20px',
            fontSize: 14,
            lineHeight: 1.5,
            color: 'var(--on-surface-variant)',
          }}
        >
          You can re-take it anytime from Settings.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button
            onClick={onCancel}
            style={{
              padding: '10px 18px',
              minHeight: 44,
              borderRadius: 'var(--radius-md)',
              background: 'transparent',
              color: 'var(--on-surface)',
              border: '1px solid var(--outline)',
              fontSize: 14,
              fontWeight: 600,
              fontFamily: 'inherit',
              cursor: 'pointer',
              flex: '1 1 auto',
            }}
          >
            Keep going
          </button>
          <button
            onClick={onConfirm}
            autoFocus
            style={{
              padding: '10px 18px',
              minHeight: 44,
              borderRadius: 'var(--radius-md)',
              background: 'var(--primary)',
              color: 'var(--background)',
              border: 'none',
              fontSize: 14,
              fontWeight: 700,
              fontFamily: 'inherit',
              cursor: 'pointer',
              flex: '1 1 auto',
            }}
          >
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}
