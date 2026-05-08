'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';
import { Mascot } from '@/components/mascot';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '24px',
        padding: '48px 24px',
        background: 'var(--background)',
        color: 'var(--on-surface)',
        textAlign: 'center',
      }}
    >
      <Mascot pose="sad" size="lg" idle="sway" priority />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '24px',
            fontWeight: 700,
            margin: 0,
            letterSpacing: '-0.02em',
          }}
        >
          Something went wrong
        </h1>
        <p
          style={{
            fontSize: '14px',
            color: 'var(--on-surface-variant)',
            margin: 0,
            maxWidth: '360px',
          }}
        >
          An unexpected error occurred. The error has been reported automatically.
        </p>
      </div>
      <button
        type="button"
        onClick={reset}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          padding: '12px 22px',
          borderRadius: 'var(--radius-md)',
          background: 'var(--primary)',
          color: 'var(--on-primary, #1a1a36)',
          fontSize: '14px',
          fontWeight: 600,
          border: 'none',
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
          refresh
        </span>
        Try again
      </button>
    </div>
  );
}
