'use client';

/* Hallmark · component: source reader drawer · genre: editorial · theme: project (cream / --quiz-* + --nm-* tokens)
 * states: close · pager · source rows · Ask Mage · Back all have hover · focus-visible · active
 * contrast: pass (semantic tokens only — theme-flipping cream↔navy, no inline hex)
 * Hallmark · pre-emit critique: P5 H5 E4 S5 R5 V4
 *
 * The Figma "Source" slide-in drawer (Phase D) for the quiz player. Opens from a
 * Sources row / the "Show source" action and shows the VERBATIM grounding passage
 * a question was generated from, highlighted, so the learner can check the claim
 * against their own material. We persist the quote (not the whole document) on the
 * question, so this is a focused passage reader — robust for community-cloned and
 * raw-text paths that have no live source document. Rides ABOVE the quiz shell
 * (z 1300) at z 1400; desktop = right slide-over, phone = full-width sheet.
 */

import { useEffect, useRef } from 'react';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import type { QuizSource } from './types';

const SOURCE_ICON: Record<NonNullable<QuizSource['kind']>, string> = {
  pdf: 'picture_as_pdf',
  ppt: 'slideshow',
  doc: 'description',
  page: 'article',
  video: 'play_circle',
  path: 'route',
  quiz: 'quiz',
};

interface SourceReaderDrawerProps {
  open: boolean;
  /** The readable sources (each carries a `quote`); the pager steps through them. */
  sources: QuizSource[];
  /** Which source is shown; clamped by the parent. */
  activeIndex: number;
  /** Step the pager (only rendered when there is more than one source). */
  onNavigate?: (index: number) => void;
  /** 1-based question number for the "Source for Question N" chip. */
  questionNumber?: number;
  /** Hand off to the Ask-Mage panel ("Ask Mage about this"). */
  onAskMage?: () => void;
  onClose: () => void;
}

export default function SourceReaderDrawer({
  open,
  sources,
  activeIndex,
  onNavigate,
  questionNumber,
  onAskMage,
  onClose,
}: SourceReaderDrawerProps) {
  const { isDesktop } = useBreakpoint();
  const isPhone = !isDesktop;
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Move focus into the drawer on open, restore it on close.
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => previous?.focus?.();
  }, [open]);

  // Swallow Escape at the CAPTURE phase so it closes THIS drawer without also
  // reaching the quiz viewer's document-level Escape handler (which would close
  // the whole quiz behind it). Only attached while the drawer is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);

  if (!open) return null;

  const source = sources[activeIndex] ?? sources[0] ?? null;
  if (!source) return null;
  const total = sources.length;
  const hasPager = total > 1 && !!onNavigate;
  const icon = SOURCE_ICON[source.kind ?? 'doc'];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1400,
        display: 'flex',
        justifyContent: 'flex-end',
      }}
    >
      <style>{`
        .qsd-scrim { animation: qsdScrim 0.2s var(--ease-spring) both; }
        @keyframes qsdScrim { from { opacity: 0; } to { opacity: 1; } }
        .qsd-panel { animation: qsdIn 0.26s var(--ease-spring) both; }
        @keyframes qsdIn { from { transform: translateX(16px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        .qsd-btn { transition: background-color 0.15s var(--ease-spring), border-color 0.15s var(--ease-spring), color 0.15s var(--ease-spring), transform 0.15s var(--ease-spring); }
        .qsd-btn:active { transform: translateY(1px); }
        .qsd-btn:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 2px; }
        .qsd-icon-btn:hover { background: var(--quiz-bg); border-color: var(--nm-primary); }
        .qsd-icon-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .qsd-ghost:hover { background: var(--quiz-bg); border-color: var(--nm-primary); color: var(--on-surface); }
        .qsd-cta:hover { filter: brightness(1.06); }
        @media (prefers-reduced-motion: reduce) {
          .qsd-scrim, .qsd-panel { animation: none; }
          .qsd-btn { transition: none; }
          .qsd-btn:active { transform: none; }
        }
      `}</style>

      {/* Scrim — click to close */}
      <button
        type="button"
        aria-label="Close source"
        className="qsd-scrim"
        onClick={onClose}
        style={{
          position: 'absolute',
          inset: 0,
          border: 'none',
          padding: 0,
          margin: 0,
          cursor: 'pointer',
          background: 'rgb(15 15 30 / 0.32)',
        }}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Source: ${source.title}`}
        tabIndex={-1}
        className="qsd-panel"
        style={{
          position: 'relative',
          height: '100%',
          width: isPhone ? '100%' : 'min(460px, 92vw)',
          background: 'var(--quiz-bg)',
          color: 'var(--on-surface)',
          borderLeft: isPhone ? 'none' : '1px solid var(--quiz-card-border)',
          boxShadow: '-20px 0 50px rgb(15 15 30 / 0.18)',
          display: 'flex',
          flexDirection: 'column',
          outline: 'none',
          fontFamily: 'inherit',
        }}
      >
        {/* ── Header ── */}
        <header
          style={{
            flexShrink: 0,
            // iOS safe area — the phone sheet is full-screen, so tuck the header
            // below the notch and inset the landscape side notch.
            padding: isPhone
              ? 'calc(14px + env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) 14px max(16px, env(safe-area-inset-left))'
              : '16px 20px',
            borderBottom: '1px solid var(--quiz-card-border)',
            background: 'var(--nm-primary-light)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '11px' }}>
            <span
              style={{
                width: '38px',
                height: '38px',
                borderRadius: 'var(--radius-md)',
                flexShrink: 0,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--quiz-card)',
                color: 'var(--nm-primary-on-light)',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 20 }} aria-hidden>
                {icon}
              </span>
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span
                style={{
                  display: 'block',
                  fontFamily: 'var(--font-display)',
                  fontSize: '15px',
                  fontWeight: 800,
                  color: 'var(--nm-primary-on-light)',
                  letterSpacing: '-0.01em',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {source.title}
              </span>
              {source.detail ? (
                <span style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--nm-primary-on-light)', opacity: 0.85 }}>
                  {source.detail}
                </span>
              ) : null}
            </span>
            {hasPager ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                <PagerButton
                  icon="chevron_left"
                  label="Previous source"
                  disabled={activeIndex <= 0}
                  onClick={() => onNavigate?.(activeIndex - 1)}
                />
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--nm-primary-on-light)', fontVariantNumeric: 'tabular-nums', minWidth: '34px', textAlign: 'center' }}>
                  {activeIndex + 1}/{total}
                </span>
                <PagerButton
                  icon="chevron_right"
                  label="Next source"
                  disabled={activeIndex >= total - 1}
                  onClick={() => onNavigate?.(activeIndex + 1)}
                />
              </span>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close source"
              className="qsd-btn qsd-icon-btn"
              style={{
                width: '38px',
                height: '38px',
                flexShrink: 0,
                borderRadius: 'var(--radius-full)',
                border: '1px solid transparent',
                background: 'transparent',
                color: 'var(--nm-primary-on-light)',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: 'inherit',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 22 }} aria-hidden>
                close
              </span>
            </button>
          </div>
        </header>

        {/* ── Body ── */}
        <div
          style={{
            flex: 1,
            overflow: 'auto',
            padding: isPhone
              ? '16px max(16px, env(safe-area-inset-right)) 16px max(16px, env(safe-area-inset-left))'
              : '20px',
            minHeight: 0,
          }}
        >
          {questionNumber ? (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '5px 11px',
                borderRadius: 'var(--radius-full)',
                background: 'var(--nm-primary-light)',
                color: 'var(--nm-primary-on-light)',
                fontSize: '12px',
                fontWeight: 700,
                marginBottom: '16px',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 15 }} aria-hidden>
                my_location
              </span>
              Source for Question {questionNumber}
            </span>
          ) : null}

          {source.quote ? (
            <figure style={{ margin: 0 }}>
              <figcaption
                style={{
                  fontSize: '11px',
                  fontWeight: 800,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: 'var(--on-surface-variant)',
                  marginBottom: '10px',
                }}
              >
                Grounding passage
              </figcaption>
              <blockquote
                style={{
                  margin: 0,
                  padding: '16px 18px',
                  borderRadius: 'var(--radius-md)',
                  borderLeft: '3px solid var(--nm-primary)',
                  background: 'var(--nm-primary-light)',
                  color: 'var(--on-surface)',
                  fontSize: '15px',
                  lineHeight: 1.7,
                }}
              >
                {source.quote}
              </blockquote>
            </figure>
          ) : (
            <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.6, color: 'var(--on-surface-variant)' }}>
              This question is grounded in {source.title}. Ask Mage to walk through how it connects.
            </p>
          )}
        </div>

        {/* ── Footer ── */}
        <footer
          style={{
            flexShrink: 0,
            borderTop: '1px solid var(--quiz-card-border)',
            background: 'var(--quiz-card)',
            padding: isPhone
              ? '12px max(16px, env(safe-area-inset-right)) calc(12px + env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left))'
              : '14px 20px',
            display: 'flex',
            flexDirection: isPhone ? 'column' : 'row',
            gap: '10px',
          }}
        >
          {onAskMage ? (
            <button
              type="button"
              onClick={onAskMage}
              className="qsd-btn qsd-cta"
              style={{
                flex: isPhone ? '0 0 auto' : 1,
                width: isPhone ? '100%' : undefined,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '7px',
                padding: '11px 16px',
                borderRadius: 'var(--radius-full)',
                border: 'none',
                background: 'var(--accent-strong)',
                color: 'var(--on-primary-container)',
                fontSize: '14px',
                fontWeight: 800,
                cursor: 'pointer',
                fontFamily: 'inherit',
                whiteSpace: 'nowrap',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }} aria-hidden>
                auto_awesome
              </span>
              Ask Mage about this
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="qsd-btn qsd-ghost"
            style={{
              flex: isPhone ? '0 0 auto' : onAskMage ? '0 0 auto' : 1,
              width: isPhone ? '100%' : undefined,
              padding: '11px 18px',
              borderRadius: 'var(--radius-full)',
              border: '1px solid var(--quiz-card-border)',
              background: 'transparent',
              color: 'var(--on-surface-variant)',
              fontSize: '14px',
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'inherit',
              whiteSpace: 'nowrap',
            }}
          >
            Back to the question
          </button>
        </footer>
      </div>
    </div>
  );
}

function PagerButton({
  icon,
  label,
  disabled,
  onClick,
}: {
  icon: string;
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="qsd-btn qsd-icon-btn"
      style={{
        width: '30px',
        height: '30px',
        borderRadius: 'var(--radius-full)',
        border: '1px solid var(--quiz-card-border)',
        background: 'var(--quiz-card)',
        color: 'var(--nm-primary-on-light)',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'inherit',
      }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 18 }} aria-hidden>
        {icon}
      </span>
    </button>
  );
}
