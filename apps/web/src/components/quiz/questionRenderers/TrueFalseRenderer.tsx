'use client';

/* Hallmark · component: true/false quiz options · genre: editorial · theme: project (cream / --nm-* + verdict tokens)
 * states: default · hover · focus-visible · active · disabled · selected · correct · wrong
 * contrast: pass (uses --surface-* / --on-surface / --nm-* / --verdict-* tokens — theme-flipping, no inline hex)
 * Hallmark · pre-emit critique: P5 H5 E4 S5 R5 V4
 *
 * Figma redesign (Quiz screens): True/False reads as two cream option rows like
 * Multiple Choice, with green/red verdict + trailing labels. Body-only — the type
 * badge, source chip and white card come from QuestionCard.
 */

import MarkdownRenderer from '@/components/ui/MarkdownRenderer';
import type { TrueFalsePayload } from '@notemage/shared';
import HintButton from './HintButton';
import type { QuestionProps } from './types';

export default function TrueFalseRenderer({
  question,
  mode,
  isAnswered,
  currentAnswer,
  reviewAnswer,
  showHint,
  onToggleHint,
  onSelectAnswer,
  isPhone,
  coarsePointer,
}: QuestionProps<TrueFalsePayload>) {
  const selectedValue = currentAnswer?.kind === 'true_false' ? currentAnswer.value : undefined;
  const reviewValue = reviewAnswer?.kind === 'true_false' ? reviewAnswer.value : undefined;
  const correctValue = question.payload?.correct ?? false;
  const isCorrect = isAnswered && selectedValue === correctValue;

  const options: { value: boolean; label: string }[] = [
    { value: true, label: 'True' },
    { value: false, label: 'False' },
  ];

  const locked = isAnswered || mode === 'review';

  return (
    <div style={{ width: '100%' }}>
      <style>{`
        .qtf-opt {
          transition: border-color 0.18s cubic-bezier(0.22, 1, 0.36, 1),
                      background-color 0.18s cubic-bezier(0.22, 1, 0.36, 1),
                      transform 0.18s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .qtf-opt:not(:disabled):hover { border-color: var(--nm-primary); }
        .qtf-opt:not(:disabled):hover .qtf-badge { background: var(--nm-primary-light); }
        .qtf-opt:not(:disabled):active { transform: translateY(1px); }
        .qtf-opt:focus-visible {
          outline: 2px solid var(--color-focus);
          outline-offset: 2px;
          border-color: var(--nm-primary);
        }
        @media (prefers-reduced-motion: reduce) {
          .qtf-opt { transition: none; }
          .qtf-opt:not(:disabled):active { transform: none; }
        }
      `}</style>

      {/* Prompt — large display heading on the cream card. */}
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: isPhone ? '20px' : 'clamp(22px, 2.2vw, 28px)',
          fontWeight: 800,
          lineHeight: 1.25,
          letterSpacing: '-0.01em',
          color: 'var(--on-surface)',
          marginBottom: '6px',
        }}
      >
        <MarkdownRenderer content={question.question} />
      </div>
      <p
        style={{
          margin: '0 0 20px',
          fontSize: '14px',
          lineHeight: 1.5,
          color: 'var(--on-surface-variant)',
        }}
      >
        Select true or false.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '14px' }}>
        {options.map(({ value, label }) => {
          const isSelected = selectedValue === value;
          const isCorrectOption = correctValue === value;
          const showResult = isAnswered || mode === 'review';
          const reviewSelected = mode === 'review' && reviewValue === value;
          const markedWrong = (isSelected || reviewSelected) && !isCorrectOption;

          // Row variant → token-composed surfaces. Correct row is always green
          // even if it was the one selected.
          let bg = 'var(--surface-container-lowest)';
          let borderColor = 'var(--outline-variant)';
          const textColor = 'var(--on-surface)';
          let badgeBg = 'var(--nm-primary-light)';
          let badgeColor = 'var(--nm-primary-on-light)';
          let badgeContent: React.ReactNode = label.charAt(0);
          let trailing: { label: string; color: string } | null = null;

          if (showResult && isCorrectOption) {
            bg = 'rgb(var(--verdict-pass-rgb) / 0.08)';
            borderColor = 'rgb(var(--verdict-pass-rgb) / 0.55)';
            badgeBg = 'var(--success)';
            badgeColor = 'var(--on-primary-container)';
            badgeContent = (
              <span className="material-symbols-outlined" style={{ fontSize: 18 }} aria-hidden>
                check
              </span>
            );
            trailing = { label: 'Correct answer', color: 'var(--success)' };
          } else if (showResult && markedWrong) {
            bg = 'rgb(var(--verdict-fail-rgb) / 0.08)';
            borderColor = 'rgb(var(--verdict-fail-rgb) / 0.55)';
            badgeBg = 'var(--error)';
            badgeColor = 'var(--on-primary-container)';
            badgeContent = (
              <span className="material-symbols-outlined" style={{ fontSize: 18 }} aria-hidden>
                close
              </span>
            );
            trailing = { label: 'Your answer', color: 'var(--error)' };
          } else if (!showResult && isSelected) {
            bg = 'var(--nm-primary-light)';
            borderColor = 'var(--nm-primary)';
            badgeBg = 'var(--nm-primary)';
            badgeColor = 'var(--on-primary-container)';
          }

          return (
            <button
              key={String(value)}
              type="button"
              className="qtf-opt"
              onClick={() => onSelectAnswer({ kind: 'true_false', value })}
              disabled={locked}
              aria-pressed={isSelected}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: isPhone ? '12px' : '14px',
                padding: isPhone ? '13px 14px' : '15px 18px',
                minHeight: coarsePointer ? '56px' : '52px',
                borderRadius: 'var(--radius-md)',
                border: `1.5px solid ${borderColor}`,
                background: bg,
                cursor: locked ? 'default' : 'pointer',
                textAlign: 'left',
                fontFamily: 'inherit',
                width: '100%',
              }}
            >
              <span
                className="qtf-badge"
                style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: 'var(--radius-sm)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '14px',
                  fontWeight: 800,
                  flexShrink: 0,
                  color: badgeColor,
                  background: badgeBg,
                  transition: 'background-color 0.18s cubic-bezier(0.22, 1, 0.36, 1)',
                }}
              >
                {badgeContent}
              </span>
              <span style={{ fontSize: '16px', color: textColor, flex: 1, lineHeight: 1.5, fontWeight: 600 }}>
                {label}
              </span>
              {trailing ? (
                <span
                  style={{
                    flexShrink: 0,
                    fontSize: '13px',
                    fontWeight: 700,
                    color: trailing.color,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {trailing.label}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <HintButton
        hint={question.hint}
        showHint={showHint}
        onToggle={onToggleHint}
        isAnswered={isAnswered}
        mode={mode}
        coarsePointer={coarsePointer}
      />

      {isAnswered && (
        <div
          style={{
            padding: '16px 18px',
            borderRadius: 'var(--radius-md)',
            background: isCorrect
              ? 'rgb(var(--verdict-pass-rgb) / 0.08)'
              : 'rgb(var(--verdict-fail-rgb) / 0.08)',
            border: `1px solid ${
              isCorrect ? 'rgb(var(--verdict-pass-rgb) / 0.3)' : 'rgb(var(--verdict-fail-rgb) / 0.3)'
            }`,
            marginBottom: '12px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '15px',
              fontWeight: 800,
              marginBottom: '6px',
              color: isCorrect ? 'var(--success)' : 'var(--error)',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }} aria-hidden>
              {isCorrect ? 'check_circle' : 'cancel'}
            </span>
            {isCorrect ? 'Correct' : 'Not quite'}
          </div>
          <div style={{ fontSize: '14px', color: 'var(--on-surface-variant)', lineHeight: 1.6 }}>
            <MarkdownRenderer
              content={
                isCorrect
                  ? question.correctExplanation ||
                    `The statement is ${correctValue ? 'true' : 'false'}.`
                  : question.wrongExplanation ||
                    `The statement is ${correctValue ? 'true' : 'false'}.`
              }
            />
          </div>
        </div>
      )}

      {mode === 'review' && (
        <div
          style={{
            padding: '16px 18px',
            borderRadius: 'var(--radius-md)',
            marginBottom: '12px',
            background:
              reviewValue !== undefined
                ? reviewValue === correctValue
                  ? 'rgb(var(--verdict-pass-rgb) / 0.08)'
                  : 'rgb(var(--verdict-fail-rgb) / 0.08)'
                : 'var(--surface-container)',
            border: `1px solid ${
              reviewValue !== undefined
                ? reviewValue === correctValue
                  ? 'rgb(var(--verdict-pass-rgb) / 0.3)'
                  : 'rgb(var(--verdict-fail-rgb) / 0.3)'
                : 'var(--ink-08)'
            }`,
          }}
        >
          {reviewValue !== undefined ? (
            <>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '15px',
                  fontWeight: 800,
                  marginBottom: '6px',
                  color: reviewValue === correctValue ? 'var(--success)' : 'var(--error)',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 18 }} aria-hidden>
                  {reviewValue === correctValue ? 'check_circle' : 'cancel'}
                </span>
                {reviewValue === correctValue
                  ? 'You answered correctly'
                  : 'You answered incorrectly'}
              </div>
              <div style={{ fontSize: '14px', color: 'var(--on-surface-variant)', lineHeight: 1.6 }}>
                <MarkdownRenderer
                  content={
                    reviewValue === correctValue
                      ? question.correctExplanation ||
                        `The statement is ${correctValue ? 'true' : 'false'}.`
                      : question.wrongExplanation ||
                        `The statement is ${correctValue ? 'true' : 'false'}.`
                  }
                />
              </div>
            </>
          ) : (
            <div style={{ fontSize: '14px', color: 'var(--on-surface-variant)' }}>
              You skipped this question. The statement is{' '}
              <strong style={{ color: 'var(--success)' }}>{correctValue ? 'true' : 'false'}</strong>
              .
            </div>
          )}
        </div>
      )}
    </div>
  );
}
