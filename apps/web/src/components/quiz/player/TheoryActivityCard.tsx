'use client';

/* Hallmark · component: theory activity card · genre: editorial · theme: project (cream / --quiz-* + --nm-* tokens)
 * states: static surface (the mobile Ask-Mage pill carries hover/active/focus-visible)
 * contrast: pass (semantic tokens only — theme-flipping cream↔navy, no inline hex)
 *
 * The white "Core concept" card that frames a checkpoint theory lesson inside
 * QuizPlayerShell (Figma "Quiz screens" — theory). It mirrors QuestionCard's
 * chrome (badge + mobile Ask-Mage pill + bottom source chip) but renders the
 * persisted theory body through the shared TheoryViewer, so math / code / images
 * / diagrams / admonition callouts all keep working. The scoped overrides below
 * dress the chat-tuned MarkdownRenderer output for the cream reading surface
 * (display title, no chat underline, Figma-style section labels + callouts).
 */

import type { ReactNode } from 'react';
import TheoryViewer from '@/components/learn/TheoryViewer';
import { SourceChip } from './QuestionCard';
import type { QuizSource } from './types';

export default function TheoryActivityCard({
  body,
  theoryId,
  source,
  isPhone,
  onAskMage,
}: {
  body: unknown;
  theoryId?: string;
  source?: QuizSource;
  isPhone: boolean;
  /** Mobile-only Ask-Mage pill (desktop uses the sidebar card). */
  onAskMage?: () => void;
}): ReactNode {
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
          marginBottom: '14px',
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
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            flexShrink: 0,
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 15 }} aria-hidden>
            menu_book
          </span>
          Core concept
        </span>

        {isPhone && onAskMage ? (
          <button
            type="button"
            onClick={onAskMage}
            className="nm-theory-mage"
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

      {/* Scoped cream overrides for the chat-tuned MarkdownRenderer output. The
          theory body's leading h2 is the lesson title; later h3s are section
          labels (Key points / Examples / Summary). These nudge the shared
          renderer toward the Figma reading surface without touching chat. */}
      <style>{`
        .nm-theory-body { color: var(--on-surface); }
        .nm-theory-body > .learn-theory-viewer > :first-child h2,
        .nm-theory-body h2:first-child {
          font-family: var(--font-display) !important;
          font-size: ${isPhone ? '23px' : '27px'} !important;
          font-weight: 800 !important;
          line-height: 1.18 !important;
          letter-spacing: -0.02em !important;
          color: var(--on-surface) !important;
          border-bottom: none !important;
          padding-bottom: 0 !important;
          margin: 0 0 10px !important;
        }
        .nm-theory-body h3 {
          font-family: var(--font-display) !important;
          font-size: 12px !important;
          font-weight: 800 !important;
          text-transform: uppercase;
          letter-spacing: 0.09em;
          color: var(--nm-primary-on-light) !important;
          margin: 22px 0 8px !important;
        }
        .nm-theory-body h4 {
          color: var(--on-surface) !important;
          text-transform: none;
          letter-spacing: 0;
          font-size: 15px !important;
        }
        .nm-theory-body p { color: var(--on-surface); }
        .nm-theory-mage { transition: transform 0.15s var(--ease-spring), filter 0.15s var(--ease-spring); }
        .nm-theory-mage:hover { filter: brightness(1.04); }
        .nm-theory-mage:active { transform: translateY(1px); }
        .nm-theory-mage:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 2px; }
        @media (prefers-reduced-motion: reduce) {
          .nm-theory-mage { transition: none; }
          .nm-theory-mage:active { transform: none; }
        }
      `}</style>

      <div className="nm-theory-body">
        <TheoryViewer body={body} theoryId={theoryId} variant="callouts" />
      </div>

      {source ? (
        <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--quiz-card-border)' }}>
          <SourceChip source={source} />
        </div>
      ) : null}
    </section>
  );
}
