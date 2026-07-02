'use client';

/* Hallmark · component: flashcard grade row · genre: editorial · theme: project (cream / --quiz-* + --nm-* tokens)
 * states: default · hover · focus-visible · active · disabled (all via qs-btn/qs-secondary/qs-cta, shared with QuizPlayerShell)
 * contrast: pass (semantic tokens only)
 *
 * Weakness Training Phase 4.3b/4.3c (plans/weakness-training-phase4.md §13.1)
 * — terse 4-button grade row (Again / Hard / Good / Easy), shared by the two
 * surfaces that self-grade flashcards: review-slot checkpoint decks
 * (`CheckpointFlashcardViewer.tsx`) and the standalone due-card queue
 * (`/practice/review`). Extracted out of `CheckpointFlashcardViewer.tsx`
 * (originally 4.3b-local) so both surfaces render byte-identical buttons
 * instead of two copies drifting apart.
 *
 * Again/Hard = secondary-weight (qs-secondary); Good/Easy = CTA-weight
 * (qs-cta) with Good as the visual default. Again gets the one --error tint
 * the design calls out; every button inherits qs-btn's hover/focus-visible/
 * active states from QuizPlayerShell's shared stylesheet (`.qs-btn`,
 * `.qs-secondary:hover`, `.qs-cta:not(:disabled):hover` in
 * QuizPlayerShell.tsx) — this component relies on that `<style>` block
 * already being mounted by the QuizPlayerShell it's rendered inside.
 */

import type { CSSProperties } from 'react';

export type ReviewQuality = 0 | 3 | 4 | 5;

export default function GradeButtonRow({
  onGrade,
  disabled,
  isPhone,
}: {
  onGrade: (quality: ReviewQuality) => void;
  disabled?: boolean;
  isPhone: boolean;
}) {
  const baseStyle: CSSProperties = {
    flex: isPhone ? '1 1 42%' : '1 1 0',
    padding: isPhone ? '12px 10px' : '12px 16px',
    borderRadius: 'var(--radius-full)',
    fontSize: isPhone ? '13px' : '14px',
    fontWeight: 800,
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: 'inherit',
    opacity: disabled ? 0.6 : 1,
  };

  return (
    <div
      role="group"
      aria-label="Grade this card"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '8px',
        justifyContent: 'center',
      }}
    >
      <button
        type="button"
        onClick={() => onGrade(0)}
        disabled={disabled}
        className="qs-btn qs-secondary"
        style={{
          ...baseStyle,
          border: '1px solid var(--error)',
          background: 'transparent',
          color: 'var(--error)',
        }}
      >
        Again
      </button>
      <button
        type="button"
        onClick={() => onGrade(3)}
        disabled={disabled}
        className="qs-btn qs-secondary"
        style={{
          ...baseStyle,
          border: '1px solid var(--quiz-card-border)',
          background: 'transparent',
          color: 'var(--on-surface)',
        }}
      >
        Hard
      </button>
      <button
        type="button"
        onClick={() => onGrade(4)}
        disabled={disabled}
        className="qs-btn qs-cta"
        style={{
          ...baseStyle,
          border: 'none',
          background: 'var(--accent-strong)',
          color: 'var(--on-primary-container)',
        }}
      >
        Good
      </button>
      <button
        type="button"
        onClick={() => onGrade(5)}
        disabled={disabled}
        className="qs-btn qs-cta"
        style={{
          ...baseStyle,
          border: 'none',
          background: 'var(--accent-strong)',
          color: 'var(--on-primary-container)',
        }}
      >
        Easy
      </button>
    </div>
  );
}
