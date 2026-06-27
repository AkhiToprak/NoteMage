'use client';

import { useState } from 'react';

// Self-contained confirm + DELETE for a study path. Calls
// DELETE /api/learn/paths/[id] (cascades the path + its generated theory,
// flashcards, and quizzes), then onDeleted() so the caller can drop it from
// its list. Mirrors the inline confirm on /learn/paths; reused on /my-path.

export function DeletePathDialog({
  planId,
  planTitle,
  onClose,
  onDeleted,
}: {
  planId: string;
  planTitle: string;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    if (deleting) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/learn/paths/${encodeURIComponent(planId)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(j?.error ?? 'Could not delete this path. Please try again.');
        setDeleting(false);
        return;
      }
      onDeleted();
    } catch {
      setError('Network error. Check your connection and try again.');
      setDeleting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Delete path"
      onClick={deleting ? undefined : onClose}
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
              color: 'var(--error)',
            }}
          >
            delete
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
              Delete this path?
            </h2>
            <p
              style={{
                margin: '6px 0 0',
                fontSize: '13px',
                color: 'var(--on-surface-variant)',
                lineHeight: 1.5,
              }}
            >
              <strong style={{ color: 'var(--on-surface)' }}>{planTitle}</strong> and everything it
              generated (theory, flashcards, and quizzes) will be permanently deleted. This can&apos;t be
              undone.
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
            disabled={deleting}
            style={{
              padding: '9px 16px',
              borderRadius: 'var(--radius-md)',
              background: 'transparent',
              color: 'var(--on-surface-variant)',
              border: '1px solid var(--outline-variant)',
              fontFamily: 'inherit',
              fontSize: '13px',
              fontWeight: 700,
              cursor: deleting ? 'default' : 'pointer',
              opacity: deleting ? 0.6 : 1,
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={deleting}
            style={{
              padding: '9px 16px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--error)',
              color: 'var(--on-error)',
              border: 'none',
              fontFamily: 'inherit',
              fontSize: '13px',
              fontWeight: 700,
              cursor: deleting ? 'default' : 'pointer',
              opacity: deleting ? 0.7 : 1,
            }}
          >
            {deleting ? 'Deleting…' : 'Delete path'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default DeletePathDialog;
