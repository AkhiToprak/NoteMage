'use client';

/* Hallmark · component: graded result panel · genre: editorial · theme: project (cream / --quiz-* + --nm-* tokens)
 * states: button — default · hover · focus-visible · active · disabled
 * contrast: pass (semantic + --nm-* tokens only — theme-flipping cream↔navy, no inline hex)
 * Hallmark · pre-emit critique: P5 H5 E4 S4 R5 V4
 *
 * The cream graded-result screen for the shared QuizPlayerShell (Phase E). Shows
 * a big hero glyph (letter grade or score), an optional 0–3 star row, a heading +
 * message, and a stack of actions (primary first). Presentational + props-driven
 * so BOTH the path checkpoint (CheckpointQuizViewer) and the exam run surface
 * (QuizSessionRunner) compose their own copy + actions onto one cream panel —
 * replacing the old `--primary`-button AssessmentResultPanel that read as washed-
 * out lavender on cream. Rendered inside the shell's `bodyOnly` slot (no sidebar,
 * no action bar — this panel carries its own buttons).
 */

import type React from 'react';

export interface GradedResultAction {
  label: string;
  onClick: () => void;
  /** primary = accent fill (default for the first action); ghost = outlined. */
  variant?: 'primary' | 'ghost';
  icon?: string;
}

interface GradedResultPanelProps {
  /** Big hero glyph — a letter grade ("A−") or a score ("64%"). */
  hero: string;
  /** Small line under the hero, e.g. "92%" or "70% to pass". */
  heroSub?: string;
  /** Hero tint: `pass` → gold; `neutral` → ink (used on a miss, no red "F"). */
  tone: 'pass' | 'neutral';
  title: string;
  message: string;
  /** 0–3 earned stars; omit to hide the row entirely. */
  stars?: number;
  /** Accessible label for the hero block (the glyph itself is decorative). */
  ariaScore: string;
  /** Actions, primary first. Each defaults to `ghost` except index 0 → `primary`. */
  actions: GradedResultAction[];
}

export default function GradedResultPanel({
  hero,
  heroSub,
  tone,
  title,
  message,
  stars,
  ariaScore,
  actions,
}: GradedResultPanelProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '16px',
        padding: '24px 8px',
      }}
    >
      <style>{`
        .grp-btn { transition: background-color 0.15s var(--ease-spring), border-color 0.15s var(--ease-spring), transform 0.15s var(--ease-spring), filter 0.15s var(--ease-spring); }
        .grp-btn:active { transform: translateY(1px); }
        .grp-btn:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 2px; }
        .grp-primary:hover { filter: brightness(1.06); }
        .grp-ghost:hover { background: var(--nm-primary-light); border-color: var(--nm-primary); color: var(--on-surface); }
        @media (prefers-reduced-motion: reduce) {
          .grp-btn { transition: none; }
          .grp-btn:active { transform: none; }
        }
      `}</style>

      <h3
        style={{
          margin: 0,
          fontFamily: 'var(--font-display)',
          fontSize: '24px',
          fontWeight: 800,
          color: 'var(--on-surface)',
          letterSpacing: '-0.01em',
          textAlign: 'center',
        }}
      >
        {title}
      </h3>

      <div
        aria-label={ariaScore}
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}
      >
        <span
          aria-hidden
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '56px',
            fontWeight: 800,
            lineHeight: 1,
            letterSpacing: '-0.04em',
            color: tone === 'pass' ? 'var(--nm-streak)' : 'var(--on-surface)',
          }}
        >
          {hero}
        </span>
        {heroSub ? (
          <span
            aria-hidden
            style={{
              fontSize: '13px',
              fontWeight: 700,
              color: 'var(--on-surface-variant)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {heroSub}
          </span>
        ) : null}
      </div>

      <p
        style={{
          margin: 0,
          fontSize: '14px',
          color: 'var(--on-surface-variant)',
          textAlign: 'center',
          lineHeight: 1.55,
          maxWidth: 'min(360px, calc(100vw - 32px))',
        }}
      >
        {message}
      </p>

      {typeof stars === 'number' ? (
        <div aria-label={`${stars} of 3 stars`} style={{ display: 'flex', gap: '6px' }}>
          {[0, 1, 2].map((i) => {
            const earned = i < stars;
            return (
              <span
                key={i}
                aria-hidden
                className="material-symbols-outlined"
                style={{
                  fontSize: '40px',
                  color: earned ? 'var(--nm-streak)' : 'var(--outline-variant)',
                  fontVariationSettings: earned ? '"FILL" 1' : '"FILL" 0',
                }}
              >
                star
              </span>
            );
          })}
        </div>
      ) : null}

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          width: '100%',
          maxWidth: 'min(320px, calc(100vw - 32px))',
        }}
      >
        {actions.map((action, i) => {
          const variant = action.variant ?? (i === 0 ? 'primary' : 'ghost');
          return (
            <button
              key={`${action.label}-${i}`}
              type="button"
              onClick={action.onClick}
              className={`grp-btn ${variant === 'primary' ? 'grp-primary' : 'grp-ghost'}`}
              style={
                variant === 'primary'
                  ? { ...primaryBtnStyle }
                  : { ...primaryBtnStyle, ...ghostExtra }
              }
            >
              {action.icon ? (
                <span className="material-symbols-outlined" style={{ fontSize: 18 }} aria-hidden>
                  {action.icon}
                </span>
              ) : null}
              {action.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const primaryBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  padding: '12px 18px',
  background: 'var(--accent-strong)',
  color: 'var(--on-primary-container)',
  border: '1px solid transparent',
  borderRadius: 'var(--radius-full)',
  fontSize: '14px',
  fontWeight: 800,
  cursor: 'pointer',
  fontFamily: 'inherit',
  width: '100%',
};

const ghostExtra: React.CSSProperties = {
  background: 'transparent',
  color: 'var(--on-surface-variant)',
  border: '1px solid var(--quiz-card-border)',
  fontWeight: 700,
};
