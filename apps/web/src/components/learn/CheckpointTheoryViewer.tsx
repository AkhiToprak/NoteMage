'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import TheoryViewer from '@/components/learn/TheoryViewer';
import type { PathActivity, PathSlot } from '@/components/learn/PathView';
import { trackEvent } from '@/lib/telemetry';

// Full-screen viewer for checkpoint theory activities. Mirrors the
// CheckpointFlashcardViewer shell — fixed overlay, slot badge + title +
// close in the header, primary "Mark as read & continue" CTA in the
// footer. Replaces the in-drawer theory rendering for checkpoint slots
// so theory gets the same focused reading surface as flashcards.

interface TheoryContentPayload {
  kind: 'theory';
  theory: { id: string; title: string; body: unknown };
}

const SLOT_KIND_LABEL: Record<string, string> = {
  learning: 'Learning',
  review: 'Review',
  assessment: 'Checkpoint',
  final_exam: 'Final Exam',
};

interface CheckpointTheoryViewerProps {
  slot: PathSlot;
  activity: PathActivity;
  onClose: () => void;
  onCompleted: () => void;
}

export default function CheckpointTheoryViewer({
  slot,
  activity,
  onClose,
  onCompleted,
}: CheckpointTheoryViewerProps) {
  const [theory, setTheory] = useState<TheoryContentPayload['theory'] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    trackEvent('path.activity.opened', {
      slotId: slot.id,
      slotKind: slot.kind,
      activityId: activity.id,
      activityKind: activity.kind,
    });
  }, [slot.id, slot.kind, activity.id, activity.kind]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/learn/activities/${encodeURIComponent(activity.id)}/content`,
        );
        const json = await res.json();
        if (cancelled) return;
        if (!json?.success) {
          setLoadError(json?.error ?? 'Could not load theory.');
          return;
        }
        const payload = json.data as TheoryContentPayload;
        if (payload?.kind !== 'theory') {
          setLoadError('Unexpected activity content.');
          return;
        }
        setTheory(payload.theory);
      } catch {
        if (!cancelled) setLoadError('Network error. Try again.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activity.id]);

  useEffect(() => {
    previousFocusRef.current = (document.activeElement as HTMLElement) ?? null;
    containerRef.current?.focus();
    return () => {
      previousFocusRef.current?.focus?.();
    };
  }, []);

  const handleDone = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/learn/activities/${encodeURIComponent(activity.id)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ completed: true }),
        },
      );
      if (res.ok) {
        onCompleted();
      } else {
        setSubmitting(false);
      }
    } catch {
      setSubmitting(false);
    }
  }, [activity.id, submitting, onCompleted]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-label={`${slot.title} theory`}
      tabIndex={-1}
      className="checkpoint-theory"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--surface)',
        color: 'var(--on-surface)',
        zIndex: 1300,
        display: 'flex',
        flexDirection: 'column',
        outline: 'none',
      }}
    >
      <style>{`
        .checkpoint-theory {
          animation: ctOverlayIn 0.22s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        @keyframes ctOverlayIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          .checkpoint-theory { animation: none; }
        }
      `}</style>

      <header
        style={{
          padding: '14px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          borderBottom: '1px solid var(--outline-variant)',
          background: 'var(--surface-container-low)',
        }}
      >
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}
        >
          <span
            style={{
              alignSelf: 'flex-start',
              display: 'inline-flex',
              alignItems: 'center',
              padding: '2px 10px',
              background: 'var(--primary)',
              color: 'var(--on-primary)',
              borderRadius: 'var(--radius-full)',
              fontSize: '10px',
              fontWeight: 800,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
            }}
          >
            {SLOT_KIND_LABEL[slot.kind] ?? slot.kind}
          </span>
          <h2
            style={{
              margin: 0,
              fontFamily: 'var(--font-display)',
              fontSize: '18px',
              fontWeight: 800,
              color: 'var(--on-surface)',
              letterSpacing: '-0.01em',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {slot.title}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close theory"
          style={{
            width: '36px',
            height: '36px',
            borderRadius: 'var(--radius-full)',
            border: '1px solid var(--outline-variant)',
            background: 'transparent',
            color: 'var(--on-surface)',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            fontFamily: 'inherit',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
            close
          </span>
        </button>
      </header>

      <div
        style={{
          flex: 1,
          overflow: 'auto',
          minHeight: 0,
        }}
      >
        <div
          style={{
            maxWidth: '720px',
            margin: '0 auto',
            padding: '32px 20px 64px',
          }}
        >
          {loadError ? (
            <p role="alert" style={{ color: 'var(--error)', fontSize: '14px' }}>
              {loadError}
            </p>
          ) : !theory ? (
            <p style={{ color: 'var(--on-surface-variant)', fontSize: '14px' }}>
              Loading theory…
            </p>
          ) : (
            <TheoryViewer body={theory.body} />
          )}
        </div>
      </div>

      {theory ? (
        <footer
          style={{
            padding: '14px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '12px',
            borderTop: '1px solid var(--outline-variant)',
            background: 'var(--surface-container-low)',
          }}
        >
          <button
            type="button"
            onClick={handleDone}
            disabled={submitting}
            style={{ ...primaryBtnStyle, opacity: submitting ? 0.6 : 1 }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
              check
            </span>
            {submitting
              ? 'Saving…'
              : activity.completed
                ? 'Done'
                : 'Mark as read & continue'}
          </button>
        </footer>
      ) : null}
    </div>
  );
}

const primaryBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '10px 18px',
  background: 'var(--primary)',
  color: 'var(--on-primary)',
  border: 'none',
  borderRadius: 'var(--radius-full)',
  fontSize: '13px',
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'inherit',
  minWidth: '180px',
  justifyContent: 'center',
};
