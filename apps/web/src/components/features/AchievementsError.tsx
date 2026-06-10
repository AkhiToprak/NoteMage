'use client';

interface AchievementsErrorProps {
  onRetry: () => void;
  /** Compact padding for the dashboard widget vs. the full shelf. */
  compact?: boolean;
}

/**
 * Shared error + retry card for the achievement surfaces. Replaces the old
 * silent `.catch(() => {})` paths, where a failed fetch was indistinguishable
 * from an empty account (and, on the dashboard, silently removed the whole
 * card). Now a failed load says so and offers a retry.
 */
export function AchievementsError({ onRetry, compact = false }: AchievementsErrorProps) {
  return (
    <div
      className="elev-1"
      role="alert"
      style={{
        padding: compact ? '20px' : '24px',
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '12px',
      }}
    >
      <span
        className="material-symbols-outlined"
        aria-hidden
        style={{ fontSize: 32, color: 'var(--text-secondary)' }}
      >
        cloud_off
      </span>
      <p style={{ margin: 0, fontSize: 'var(--fs-sm)', color: 'var(--on-surface-variant)' }}>
        Couldn&rsquo;t load achievements.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="ach-retry-btn"
        style={{
          minHeight: 44,
          padding: '0 18px',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--brand-purple-edge)',
          background: 'var(--brand-purple-wash)',
          color: 'var(--md-h4)',
          fontSize: 'var(--fs-sm)',
          fontWeight: 600,
          fontFamily: 'inherit',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          transition:
            'background var(--dur-fast) var(--ease-spring), transform var(--dur-fast) var(--ease-spring)',
        }}
      >
        <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 18 }}>
          refresh
        </span>
        Try again
      </button>
      <style>{`
        .ach-retry-btn:hover { background: var(--brand-purple-hover); }
        .ach-retry-btn:active { transform: translateY(1px); }
        .ach-retry-btn:focus-visible {
          outline: 2px solid var(--color-focus);
          outline-offset: 2px;
        }
        @media (prefers-reduced-motion: reduce) {
          .ach-retry-btn { transition: none !important; }
        }
      `}</style>
    </div>
  );
}
