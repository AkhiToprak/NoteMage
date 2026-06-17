'use client';

import { useState } from 'react';

// Self-contained confirm + POST /api/learn/paths/[id]/reset for a study path.
// Clears progress (completion, stars, best scores, flashcard review schedule)
// while keeping the generated theory/flashcards/quizzes, then onReset() so the
// caller can refresh. Mirrors the inline confirm formerly on /learn/paths.

export function ResetPathDialog({
  planId,
  planTitle,
  onClose,
  onReset,
}: {
  planId: string;
  planTitle: string;
  onClose: () => void;
  onReset: () => void;
}) {
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    if (resetting) return;
    setResetting(true);
    setError(null);
    try {
      const res = await fetch(`/api/learn/paths/${encodeURIComponent(planId)}/reset`, {
        method: 'POST',
      });
      const json = (await res.json().catch(() => null)) as { success?: boolean; error?: string } | null;
      if (json?.success) {
        onReset();
      } else {
        setError(json?.error ?? 'Could not reset the path.');
        setResetting(false);
      }
    } catch {
      setError('Network error. Try again.');
      setResetting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Reset path progress"
      onClick={resetting ? undefined : onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1300,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(4px)',
        padding: '20px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '440px',
          maxWidth: '95vw',
          background: 'var(--surface-container)',
          color: 'var(--on-surface)',
          borderRadius: 'var(--radius-xl)',
          border: '1px solid var(--outline-variant)',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
          <span
            aria-hidden
            className="material-symbols-outlined"
            style={{
              fontSize: '22px',
              width: '40px',
              height: '40px',
              flexShrink: 0,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 'var(--radius-full)',
              background: 'var(--surface-container-highest)',
              color: 'var(--md-h4)',
            }}
          >
            restart_alt
          </span>
          <div style={{ minWidth: 0 }}>
            <h2
              style={{
                margin: 0,
                fontFamily: 'var(--font-display)',
                fontSize: '18px',
                fontWeight: 800,
                color: 'var(--on-surface)',
                letterSpacing: '-0.01em',
              }}
            >
              Reset this path?
            </h2>
            <p
              style={{
                margin: '6px 0 0',
                fontSize: '13px',
                color: 'var(--on-surface-variant)',
                lineHeight: 1.5,
              }}
            >
              Your progress on <strong style={{ color: 'var(--on-surface)' }}>{planTitle}</strong>{' '}
              — completion, stars, best scores, and flashcard review schedule — will be cleared so
              you can start over. The theory, flashcards, and quizzes themselves are kept. This
              can&apos;t be undone.
            </p>
          </div>
        </div>

        {error ? (
          <p role="alert" style={{ margin: 0, fontSize: '13px', color: 'var(--error)' }}>
            {error}
          </p>
        ) : null}

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
            disabled={resetting}
            style={{
              padding: '10px 16px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--outline-variant)',
              background: 'var(--surface-container-high)',
              color: 'var(--on-surface)',
              fontFamily: 'inherit',
              fontSize: '14px',
              fontWeight: 700,
              cursor: resetting ? 'not-allowed' : 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={resetting}
            style={{
              padding: '10px 16px',
              borderRadius: 'var(--radius-md)',
              border: 'none',
              background: 'var(--primary)',
              color: 'var(--on-primary)',
              fontFamily: 'inherit',
              fontSize: '14px',
              fontWeight: 700,
              cursor: resetting ? 'not-allowed' : 'pointer',
              opacity: resetting ? 0.7 : 1,
            }}
          >
            {resetting ? 'Resetting…' : 'Reset progress'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ResetPathDialog;
