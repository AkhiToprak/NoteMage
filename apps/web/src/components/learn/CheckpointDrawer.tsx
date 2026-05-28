'use client';

import { useEffect, useRef } from 'react';
import ActivityList from '@/components/learn/ActivityList';
import type { PathSlot } from '@/components/learn/PathView';
import { trackEvent } from '@/lib/telemetry';

// Slide-in sheet (right edge on desktop, bottom on mobile) that hosts
// the activity list for one slot. Every activity kind — theory,
// flashcards, quiz — has its own full-screen viewer; the parent page
// picks which surface to mount based on activity.kind, so this drawer
// only ever renders the list. URL state is owned by the parent page:
// ?slot=<slotId>&activity=<activityId>. Tapping an activity sets
// ?activity= and the parent routes away from the drawer to the viewer.

interface CheckpointDrawerProps {
  slot: PathSlot;
  /** Update the URL — null pops back to the list view. */
  onSelectActivity: (activityId: string | null) => void;
  /** Close the drawer entirely (clear ?slot= as well). */
  onClose: () => void;
}

const SLOT_KIND_LABEL: Record<string, string> = {
  learning: 'Learning',
  review: 'Review',
  assessment: 'Checkpoint',
  final_exam: 'Final Exam',
};

export default function CheckpointDrawer({
  slot,
  onSelectActivity,
  onClose,
}: CheckpointDrawerProps) {
  const drawerRef = useRef<HTMLElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Phase 10.7 — telemetry. One event per slot the drawer hosts, with
  // the slot kind so analytics can split usage by learning vs review
  // vs assessment.
  useEffect(() => {
    trackEvent('path.slot.opened', { slotId: slot.id, slotKind: slot.kind });
  }, [slot.id, slot.kind]);

  // Phase 10.7 — escape closes the drawer; focus the drawer container
  // on mount so screen readers + keyboard users see the new context.
  // Restores focus to the previously focused element on close.
  useEffect(() => {
    previousFocusRef.current = (document.activeElement as HTMLElement) ?? null;
    drawerRef.current?.focus();
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        ev.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previousFocusRef.current?.focus?.();
    };
  }, [onClose]);

  return (
    <>
      <div
        aria-hidden
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.55)',
          backdropFilter: 'blur(2px)',
          zIndex: 1200,
        }}
      />
      <aside
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label={slot.title}
        tabIndex={-1}
        className="checkpoint-drawer"
        style={{
          position: 'fixed',
          background: 'var(--surface)',
          color: 'var(--on-surface)',
          zIndex: 1210,
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 0 32px rgba(0, 0, 0, 0.45)',
          outline: 'none',
        }}
      >
        <style>{`
          .checkpoint-drawer {
            top: 0;
            right: 0;
            bottom: 0;
            width: min(480px, 100vw);
            border-left: 1px solid var(--outline-variant);
            animation: drawerSlideIn 0.22s cubic-bezier(0.22, 1, 0.36, 1) both;
          }
          @media (max-width: 768px) {
            .checkpoint-drawer {
              top: auto;
              left: 0;
              right: 0;
              bottom: 0;
              width: 100%;
              max-height: 90vh;
              border-left: none;
              border-top: 1px solid var(--outline-variant);
              border-top-left-radius: var(--radius-xl);
              border-top-right-radius: var(--radius-xl);
              animation: drawerSlideUp 0.22s cubic-bezier(0.22, 1, 0.36, 1) both;
            }
          }
          @keyframes drawerSlideIn {
            from { transform: translateX(100%); opacity: 0; }
            to   { transform: translateX(0);    opacity: 1; }
          }
          @keyframes drawerSlideUp {
            from { transform: translateY(100%); opacity: 0; }
            to   { transform: translateY(0);    opacity: 1; }
          }
          @media (prefers-reduced-motion: reduce) {
            .checkpoint-drawer { animation: none; }
          }
        `}</style>

        {/* Header */}
        <header
          style={{
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px',
            borderBottom: '1px solid var(--outline-variant)',
            background: 'var(--surface-container-low)',
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
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
            </div>
            <h2
              style={{
                margin: '6px 0 0',
                fontFamily: 'var(--font-display)',
                fontSize: '18px',
                fontWeight: 800,
                color: 'var(--on-surface)',
                letterSpacing: '-0.01em',
              }}
            >
              {slot.title}
            </h2>
            {/* Progress dots */}
            {slot.activities.length > 0 ? (
              <div
                aria-label="Activity progress"
                style={{
                  marginTop: '8px',
                  display: 'flex',
                  gap: '4px',
                }}
              >
                {slot.activities.map((a) => (
                  <span
                    key={a.id}
                    aria-hidden
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: a.completed
                        ? 'var(--primary)'
                        : 'var(--outline-variant)',
                    }}
                  />
                ))}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close drawer"
            style={{
              width: '32px',
              height: '32px',
              borderRadius: 'var(--radius-full)',
              border: '1px solid var(--outline-variant)',
              background: 'transparent',
              color: 'var(--on-surface)',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
              close
            </span>
          </button>
        </header>

        {/* Body */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '18px 20px 24px',
          }}
        >
          {slot.incompleteGeneration ? (
            <div
              style={{
                display: 'flex',
                gap: '10px',
                padding: '12px 14px',
                marginBottom: '12px',
                background: 'var(--surface-container-low)',
                border: '1px solid var(--outline-variant)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <span
                aria-hidden
                className="material-symbols-outlined"
                style={{
                  fontSize: '20px',
                  width: '32px',
                  height: '32px',
                  flexShrink: 0,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 'var(--radius-full)',
                  background: 'var(--tertiary-container)',
                  color: 'var(--on-tertiary-container)',
                }}
              >
                sync_problem
              </span>
              <div style={{ minWidth: 0 }}>
                <p
                  style={{
                    margin: 0,
                    fontSize: '13px',
                    fontWeight: 700,
                    color: 'var(--on-surface)',
                  }}
                >
                  Some content is still missing
                </p>
                <p
                  style={{
                    margin: '2px 0 0',
                    fontSize: '12px',
                    color: 'var(--on-surface-variant)',
                    lineHeight: 1.45,
                  }}
                >
                  Didn&apos;t fully generate. Regenerate the path to fill it in.
                </p>
              </div>
            </div>
          ) : null}
          <ActivityList slot={slot} onOpenActivity={(a) => onSelectActivity(a.id)} />
        </div>
      </aside>
    </>
  );
}

