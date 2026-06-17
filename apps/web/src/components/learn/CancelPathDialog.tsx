'use client';

import { useState } from 'react';
import { useToast } from '@/components/ui/Toast';

// Self-contained confirm for stopping a generation (live or wedged) or
// restoring a stalled translation.
//   · generationMode === 'translate' → POST /cancel (non-destructive restore)
//   · otherwise                      → DELETE (discards the partial path)
// Ultra generations that are stopped may have their credit refunded; the route
// reports `creditRefunded` / `refundLimited` and we surface that as a toast so
// Ultra users keep billing visibility. Mirrors the inline dialog formerly on
// /learn/paths. `stuck` is computed by the caller (dead orchestrator) and only
// changes the copy/labels.

const SUPPORT_MAILTO = 'mailto:notemage.app@gmail.com?subject=Ultra%20path%20credit%20refund';

export function CancelPathDialog({
  planId,
  planTitle,
  generationMode,
  stuck,
  ultra,
  onClose,
  onCancelled,
}: {
  planId: string;
  planTitle: string;
  generationMode?: string | null;
  stuck: boolean;
  ultra: boolean;
  onClose: () => void;
  onCancelled: () => void;
}) {
  const { toast } = useToast();
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isTranslate = generationMode === 'translate';

  const confirm = async () => {
    if (cancelling) return;
    setCancelling(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/learn/paths/${encodeURIComponent(planId)}${isTranslate ? '/cancel' : ''}`,
        { method: isTranslate ? 'POST' : 'DELETE' },
      );
      const json = (await res.json().catch(() => null)) as
        | { success?: boolean; error?: string; data?: { refundLimited?: boolean; creditRefunded?: boolean } }
        | null;
      if (json?.success) {
        // Tell the user what happened to their Ultra credit. The DELETE route
        // refunds a never-delivered Ultra path, but only the first few cancels
        // per day — past that it points them to support.
        if (!isTranslate && ultra) {
          if (json?.data?.refundLimited) {
            toast({
              title: 'Ultra credit not refunded',
              description:
                "Your path was stopped, but you've hit today's cancel limit so the credit wasn't returned automatically. Contact support to recover it.",
              variant: 'error',
              duration: 0,
              action: { label: 'Email support', href: SUPPORT_MAILTO },
            });
          } else if (json?.data?.creditRefunded) {
            toast({
              title: 'Ultra credit refunded',
              description: 'Your path was stopped and the credit returned to this month.',
              variant: 'success',
            });
          }
        }
        onCancelled();
      } else {
        setError(json?.error ?? 'Could not stop this path. If it just started, give it a moment.');
        setCancelling(false);
      }
    } catch {
      setError('Network error. Try again.');
      setCancelling(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={isTranslate ? 'Restore path' : stuck ? 'Stop generating path' : 'Cancel path'}
      onClick={cancelling ? undefined : onClose}
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
              color: isTranslate ? 'var(--primary)' : 'var(--error)',
            }}
          >
            sync_problem
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
              {isTranslate
                ? 'Restore this path?'
                : stuck
                  ? 'Stop generating this path?'
                  : 'Cancel this path?'}
            </h2>
            <p
              style={{
                margin: '6px 0 0',
                fontSize: '13px',
                color: 'var(--on-surface-variant)',
                lineHeight: 1.5,
              }}
            >
              {isTranslate ? (
                <>
                  <strong style={{ color: 'var(--on-surface)' }}>{planTitle}</strong>&apos;s
                  translation stalled, but the path itself is intact. Restoring brings it back to
                  normal — you can translate it again afterwards.
                </>
              ) : stuck ? (
                <>
                  <strong style={{ color: 'var(--on-surface)' }}>{planTitle}</strong> got stuck and
                  can&apos;t finish. Stopping it removes the path and anything generated so far, so
                  you can create a fresh one. This can&apos;t be undone.
                </>
              ) : (
                <>
                  <strong style={{ color: 'var(--on-surface)' }}>{planTitle}</strong> is still being
                  built. Cancelling stops generation and removes the path and anything generated so
                  far. This can&apos;t be undone.
                </>
              )}
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
            disabled={cancelling}
            style={{
              padding: '9px 16px',
              borderRadius: 'var(--radius-md)',
              background: 'transparent',
              color: 'var(--on-surface-variant)',
              border: '1px solid var(--outline-variant)',
              fontFamily: 'inherit',
              fontSize: '13px',
              fontWeight: 700,
              cursor: cancelling ? 'default' : 'pointer',
              opacity: cancelling ? 0.6 : 1,
            }}
          >
            Keep waiting
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={cancelling}
            aria-busy={cancelling}
            style={{
              padding: '9px 16px',
              borderRadius: 'var(--radius-md)',
              background: isTranslate ? 'var(--primary)' : 'var(--error)',
              color: isTranslate ? 'var(--on-primary)' : 'var(--on-error)',
              border: 'none',
              fontFamily: 'inherit',
              fontSize: '13px',
              fontWeight: 700,
              cursor: cancelling ? 'default' : 'pointer',
              opacity: cancelling ? 0.7 : 1,
            }}
          >
            {cancelling
              ? isTranslate
                ? 'Restoring…'
                : stuck
                  ? 'Stopping…'
                  : 'Cancelling…'
              : isTranslate
                ? 'Restore path'
                : stuck
                  ? 'Stop generating'
                  : 'Cancel path'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default CancelPathDialog;
