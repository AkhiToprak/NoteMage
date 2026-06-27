'use client';

/* Hallmark · component: quiz question card · genre: editorial · theme: project (cream / --quiz-* + --nm-* tokens)
 * states: static container (interactive states live in the renderer it wraps)
 * contrast: pass (semantic tokens only — theme-flipping, no inline hex)
 *
 * The white card that frames each question renderer in QuizPlayerShell. Owns the
 * type badge (and the mobile Ask-Mage pill) + an optional source chip; the
 * renderer it wraps stays "prompt → answer UI → feedback". Body-only renderers
 * (MCRenderer et al.) are unchanged — this is additive chrome for the shell, so
 * the still-mounted study-pack page (which renders renderers bare) is untouched.
 */

import type { ReactNode } from 'react';
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

export function SourceChip({ source }: { source: QuizSource }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '7px',
        padding: '6px 11px 6px 8px',
        borderRadius: 'var(--radius-full)',
        background: 'var(--quiz-bg)',
        border: '1px solid var(--quiz-card-border)',
        color: 'var(--on-surface-variant)',
        fontSize: '12px',
        fontWeight: 600,
        maxWidth: '100%',
      }}
    >
      <span
        className="material-symbols-outlined"
        style={{ fontSize: 16, color: 'var(--nm-primary-on-light)', flexShrink: 0 }}
        aria-hidden
      >
        {SOURCE_ICON[source.kind ?? 'doc']}
      </span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {source.title}
        {source.detail ? <span style={{ color: 'var(--on-surface-variant)', opacity: 0.7 }}> · {source.detail}</span> : null}
      </span>
    </span>
  );
}

export default function QuestionCard({
  kindLabel,
  source,
  isPhone,
  onAskMage,
  children,
}: {
  kindLabel: string;
  source?: QuizSource;
  isPhone: boolean;
  /** Mobile-only Ask-Mage pill in the card header (desktop uses the sidebar card). */
  onAskMage?: () => void;
  children: ReactNode;
}) {
  return (
    <section
      style={{
        background: 'var(--quiz-card)',
        border: '1px solid var(--quiz-card-border)',
        borderRadius: 'var(--radius-xl)',
        padding: isPhone ? '18px 16px' : '28px 30px',
        boxShadow: '0 1px 2px rgb(15 15 30 / 0.04), 0 14px 34px rgb(15 15 30 / 0.05)',
        width: '100%',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '10px',
          marginBottom: source ? '12px' : '18px',
        }}
      >
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
            letterSpacing: '0.01em',
            flexShrink: 0,
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 15 }} aria-hidden>
            quiz
          </span>
          {kindLabel}
        </span>

        {isPhone && onAskMage ? (
          <button
            type="button"
            onClick={onAskMage}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: 'var(--radius-full)',
              background: 'var(--nm-primary-light)',
              color: 'var(--nm-primary-on-light)',
              border: 'none',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'inherit',
              flexShrink: 0,
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 15 }} aria-hidden>
              auto_awesome
            </span>
            Ask Mage
          </button>
        ) : null}
      </div>

      {source ? (
        <div style={{ marginBottom: '16px' }}>
          <SourceChip source={source} />
        </div>
      ) : null}

      {children}
    </section>
  );
}
