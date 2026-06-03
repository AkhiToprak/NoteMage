'use client';

import { useState } from 'react';
import MarkdownRenderer from '@/components/ui/MarkdownRenderer';
import type { EquationPayload } from '@notemage/shared';
import type { QuestionProps } from './types';

export default function EquationRenderer({
  question,
  mode,
  isAnswered,
  currentAnswer,
  reviewAnswer,
  showHint,
  onToggleHint,
  onSelectAnswer,
  isPhone,
}: QuestionProps<EquationPayload | null>) {
  const payload = question.payload;
  const [draft, setDraft] = useState('');

  const submittedExpression =
    mode === 'review'
      ? reviewAnswer?.kind === 'equation'
        ? reviewAnswer.expression
        : undefined
      : currentAnswer?.kind === 'equation'
        ? currentAnswer.expression
        : undefined;

  // QuizViewer keys this component by question.id, so navigation unmounts
  // and remounts — useState initializes to '' on each mount.

  // Client doesn't recompute equation correctness — it's already on the
  // entry stored in QuizViewer's answers Map (set via grade() at select time).
  // For review-mode display we re-derive a presentational correct/wrong from
  // whether the stored answer matches one of the canonical surfaces — but
  // since we can't access the QuizViewer's stored isCorrect from here, we
  // show neutral "submitted" framing during quiz and reveal the expected
  // expression after submission.
  const expectedExpression = payload?.expectedExpression ?? '';

  const submit = () => {
    if (isAnswered || mode === 'review') return;
    const expression = draft.trim();
    if (expression.length === 0) return;
    onSelectAnswer({ kind: 'equation', expression });
  };

  const inputValue = submittedExpression ?? draft;
  const inputDisabled = isAnswered || mode === 'review';

  // We re-check equivalence client-side only for display copy. The real
  // grade is the server's — but in QuizViewer the same grade() was already
  // run at submit-time and stored. Mirror the wording by comparing the
  // submitted string to the expected one (strict match → "Correct"; mismatch
  // is conservative and just says "Submitted" since symbolic equivalence
  // requires evaluating mathjs which lives in grade()).
  const matchedLiteral =
    submittedExpression !== undefined &&
    expectedExpression.length > 0 &&
    normalize(submittedExpression) === normalize(expectedExpression);

  return (
    <div
      style={{
        width: '100%',
        maxWidth: isPhone ? '100%' : '480px',
        marginBottom: '20px',
      }}
    >
      <div
        style={{
          background: 'var(--quiz-question-surface)',
          border: '1px solid rgba(174,137,255,0.38)',
          borderRadius: '16px',
          padding: isPhone ? '20px 16px' : '28px 24px',
          marginBottom: '16px',
          boxShadow: '0 2px 14px rgba(0,0,0,0.55), inset 0 1px 0 rgba(196,169,255,0.10)',
        }}
      >
        <div style={{ fontSize: '18px', color: '#f5f1ff', lineHeight: 1.6 }}>
          <MarkdownRenderer content={question.question} />
        </div>
      </div>

      <div style={{ display: 'flex', marginBottom: '8px' }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            background: 'rgba(140,82,255,0.12)',
            border: '1px solid rgba(140,82,255,0.3)',
            borderRadius: '999px',
            padding: '4px 12px',
            fontSize: '11px',
            fontWeight: 700,
            color: 'var(--accent-strong)',
            fontFamily: 'inherit',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 12 }} aria-hidden>functions</span> Math input
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
        <input
          value={inputValue}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            }
          }}
          disabled={inputDisabled}
          placeholder="e.g. 2*x + 3, sqrt(16), pi/2"
          aria-label="Type your equation answer"
          autoFocus={!inputDisabled}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          autoCorrect="off"
          style={{
            width: '100%',
            padding: isPhone ? '12px 14px' : '14px 16px',
            minHeight: '48px',
            borderRadius: '12px',
            border: `1px solid ${
              inputDisabled ? 'rgba(140,82,255,0.5)' : 'rgba(140,82,255,0.32)'
            }`,
            background: 'var(--surface-container)',
            color: inputDisabled ? 'var(--accent-strong)' : 'var(--on-surface)',
            fontSize: '16px',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
            outline: 'none',
            letterSpacing: '0.02em',
          }}
        />
        <span
          style={{
            fontSize: '11px',
            color: 'var(--on-surface-variant)',
            fontFamily: 'inherit',
            letterSpacing: '0.02em',
          }}
        >
          Use <code>*</code> for multiplication, <code>^</code> for powers,{' '}
          <code>sqrt()</code> for square roots.
        </span>

        {!inputDisabled && (
          <button
            onClick={submit}
            disabled={draft.trim().length === 0}
            style={{
              padding: '10px 18px',
              borderRadius: '10px',
              border: 'none',
              background: draft.trim().length === 0 ? 'rgba(140,82,255,0.18)' : '#8c52ff',
              color: draft.trim().length === 0 ? 'var(--on-surface-variant)' : 'var(--on-surface)',
              fontSize: '13px',
              fontWeight: 600,
              cursor: draft.trim().length === 0 ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              alignSelf: 'flex-end',
              marginTop: '6px',
              boxShadow:
                draft.trim().length === 0 ? 'none' : '0 4px 16px rgba(140,82,255,0.25)',
              transition: 'background 0.15s, box-shadow 0.15s',
            }}
          >
            Submit answer
          </button>
        )}
      </div>

      {question.hint && !isAnswered && mode === 'quiz' && (
        <button
          onClick={onToggleHint}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 14px',
            borderRadius: '10px',
            border: '1px solid rgba(251,191,36,0.2)',
            background: showHint ? 'rgba(251,191,36,0.08)' : 'transparent',
            color: 'var(--warning)',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
            marginBottom: '12px',
            fontFamily: 'inherit',
            transition: 'background 0.12s',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 13 }} aria-hidden>lightbulb</span>
          {showHint ? 'Hide Hint' : 'Show Hint'}
        </button>
      )}
      {showHint && question.hint && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: '10px',
            background: 'var(--ink-08)',
            border: '1px solid rgba(251,191,36,0.15)',
            fontSize: '13px',
            color: 'var(--warning)',
            marginBottom: '12px',
            lineHeight: 1.6,
          }}
        >
          {question.hint}
        </div>
      )}

      {submittedExpression !== undefined && (
        <div
          style={{
            padding: '14px 18px',
            borderRadius: '12px',
            background: matchedLiteral ? 'rgba(74,222,128,0.06)' : 'rgba(140,82,255,0.06)',
            border: `1px solid ${
              matchedLiteral ? 'rgba(74,222,128,0.2)' : 'rgba(140,82,255,0.2)'
            }`,
            marginBottom: '12px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '14px',
              fontWeight: 700,
              marginBottom: '6px',
              color: matchedLiteral ? 'var(--success)' : 'var(--accent-strong)',
            }}
          >
            {matchedLiteral ? (
              <>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }} aria-hidden>check_circle</span> Exact match
              </>
            ) : (
              <>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }} aria-hidden>cancel</span> Submitted — see expected expression below
              </>
            )}
          </div>
          <div
            style={{
              fontSize: '13px',
              color: 'var(--on-surface-variant)',
              lineHeight: 1.6,
              fontFamily: 'inherit',
            }}
          >
            Expected:{' '}
            <code
              style={{
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                color: 'var(--accent-strong)',
                padding: '2px 6px',
                borderRadius: '6px',
                background: 'var(--ink-08)',
              }}
            >
              {expectedExpression || '—'}
            </code>
          </div>
          {!matchedLiteral && (
            <div
              style={{
                marginTop: '8px',
                fontSize: '12px',
                color: 'var(--on-surface-variant)',
                lineHeight: 1.6,
              }}
            >
              <MarkdownRenderer
                content={
                  question.correctExplanation ||
                  'Equivalent expressions are accepted — the grader evaluates your answer numerically.'
                }
              />
            </div>
          )}
        </div>
      )}

      {mode === 'review' && submittedExpression === undefined && (
        <div
          style={{
            padding: '14px 18px',
            borderRadius: '12px',
            marginBottom: '12px',
            background: 'var(--surface-container)',
            border: '1px solid var(--ink-08)',
          }}
        >
          <div style={{ fontSize: '13px', color: 'var(--on-surface-variant)' }}>
            You skipped this question. Expected:{' '}
            <strong style={{ color: 'var(--success)' }}>{expectedExpression || '—'}</strong>.
          </div>
        </div>
      )}
    </div>
  );
}

function normalize(s: string): string {
  return s.replace(/\s+/g, '').toLowerCase();
}
