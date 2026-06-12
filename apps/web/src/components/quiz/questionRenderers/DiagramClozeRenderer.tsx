'use client';

import { useMemo } from 'react';
import MarkdownRenderer from '@/components/ui/MarkdownRenderer';
import PathDiagram from '@/components/learn/PathDiagram';
import { DIAGRAM_CLOZE_MASK, type DiagramClozePayload } from '@notemage/shared';
import { shuffleByKey } from './quizShuffle';
import HintButton from './HintButton';
import type { QuestionProps } from './types';

// DiagramClozeRenderer — "what's missing in this diagram?" (Phase 5). The
// learner sees the masked diagram (one label drawn as a "?" chip) and picks the
// missing label from 4 options. It's multiple-choice at heart: the option UI,
// answer-state, and review treatment mirror MCRenderer exactly. The masked
// diagram comes from `payload.diagram`; options + correctIndex ride the legacy
// columns (mirrored from the payload by buildLegacyColumns), so this reads them
// the same way MCRenderer does. Built in code, never by an LLM (zero AI tokens).
//
// Design: design tokens only (no hex/gradients), no transition-all (only
// background/border-color transitions), every option has hover/:focus-visible
// (visible ring)/active, ≥44px touch targets, terse copy, light-mode safe.
export default function DiagramClozeRenderer({
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
}: QuestionProps<DiagramClozePayload>) {
  const selectedIdx =
    currentAnswer?.kind === 'diagram_cloze' ? currentAnswer.selectedIdx : undefined;
  const reviewIdx =
    reviewAnswer?.kind === 'diagram_cloze' ? reviewAnswer.selectedIdx : undefined;
  const isCorrect = isAnswered && selectedIdx === question.correctIndex;

  // Present options in a content-independent order (seeded by question.id) so
  // the correct slot can't be inferred from emission order. We shuffle the
  // INDICES, so selectedIdx still refers to the original option index and
  // grading (which compares against payload.correctIndex) is untouched.
  const displayOrder = useMemo(
    () => shuffleByKey(question.options.map((_, i) => i), question.id),
    [question.options, question.id]
  );

  const diagram = question.payload?.diagram;

  return (
    <div style={{ width: '100%', maxWidth: isPhone ? '100%' : '560px', marginBottom: '20px' }}>
      <style>{`
        .dgc-option:hover:not(:disabled), .dgc-option.is-hover {
          border-color: var(--primary);
        }
        .dgc-option:focus-visible {
          outline: 2px solid var(--primary);
          outline-offset: 2px;
        }
        .dgc-option:active:not(:disabled) {
          transform: translateY(1px);
        }
      `}</style>

      <div
        style={{
          background: 'var(--quiz-question-surface)',
          border: '1px solid var(--outline-variant)',
          borderRadius: '16px',
          padding: isPhone ? '20px 16px' : '24px',
          marginBottom: '16px',
          boxShadow: '0 2px 14px rgba(0,0,0,0.18)',
        }}
      >
        <div style={{ fontSize: '18px', color: 'var(--on-surface)', lineHeight: 1.6, marginBottom: '14px' }}>
          <MarkdownRenderer content={question.question} />
        </div>
        {/* The masked diagram — the missing label renders as a "?" chip. */}
        {diagram ? <PathDiagram diagram={diagram} maskMarker={DIAGRAM_CLOZE_MASK} /> : null}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
        {displayOrder.map((origIdx, pos) => {
          const option = question.options[origIdx];
          const letter = String.fromCharCode(65 + pos);
          const isSelected = selectedIdx === origIdx;
          const isCorrectOption = question.correctIndex === origIdx;
          const showResult = isAnswered || mode === 'review';
          const reviewSelected = mode === 'review' && reviewIdx === origIdx;

          let borderColor = 'var(--outline-variant)';
          let bg = 'var(--surface-container)';
          let textColor = 'var(--on-surface-variant)';

          if (showResult) {
            if (isCorrectOption) {
              borderColor = 'rgb(var(--verdict-pass-rgb) / 0.5)';
              bg = 'rgb(var(--verdict-pass-rgb) / 0.08)';
              textColor = 'var(--success)';
            } else if (isSelected || reviewSelected) {
              borderColor = 'rgb(var(--verdict-fail-rgb) / 0.5)';
              bg = 'rgb(var(--verdict-fail-rgb) / 0.08)';
              textColor = 'var(--error)';
            }
          } else if (isSelected) {
            borderColor = 'var(--primary)';
            bg = 'var(--surface-container-high)';
            textColor = 'var(--on-surface)';
          }

          const locked = isAnswered || mode === 'review';

          return (
            <button
              key={origIdx}
              type="button"
              className="dgc-option"
              onClick={() => onSelectAnswer({ kind: 'diagram_cloze', selectedIdx: origIdx })}
              disabled={locked}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: isPhone ? '10px' : '12px',
                padding: isPhone ? '12px 14px' : '14px 16px',
                minHeight: '44px',
                borderRadius: '12px',
                border: `1px solid ${borderColor}`,
                background: bg,
                cursor: locked ? 'default' : 'pointer',
                textAlign: 'left',
                fontFamily: 'inherit',
                transition: 'background 0.15s, border-color 0.15s, transform 0.05s',
                width: '100%',
              }}
            >
              <span
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  border: `2px solid ${borderColor}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '12px',
                  fontWeight: 700,
                  flexShrink: 0,
                  color: textColor,
                  background:
                    showResult && isCorrectOption
                      ? 'rgb(var(--verdict-pass-rgb) / 0.15)'
                      : showResult && (isSelected || reviewSelected)
                        ? 'rgb(var(--verdict-fail-rgb) / 0.15)'
                        : 'transparent',
                }}
              >
                {showResult && isCorrectOption ? (
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }} aria-hidden>
                    check_circle
                  </span>
                ) : showResult && (isSelected || reviewSelected) ? (
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }} aria-hidden>
                    cancel
                  </span>
                ) : (
                  letter
                )}
              </span>
              <span style={{ fontSize: '16px', color: textColor, flex: 1, lineHeight: 1.5 }}>
                <MarkdownRenderer content={option} />
              </span>
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
            padding: '14px 18px',
            borderRadius: '12px',
            background: isCorrect
              ? 'rgb(var(--verdict-pass-rgb) / 0.06)'
              : 'rgb(var(--verdict-fail-rgb) / 0.06)',
            border: `1px solid ${
              isCorrect
                ? 'rgb(var(--verdict-pass-rgb) / 0.2)'
                : 'rgb(var(--verdict-fail-rgb) / 0.2)'
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
              color: isCorrect ? 'var(--success)' : 'var(--error)',
            }}
          >
            {isCorrect ? (
              <>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }} aria-hidden>
                  check_circle
                </span>{' '}
                Correct!
              </>
            ) : (
              <>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }} aria-hidden>
                  cancel
                </span>{' '}
                Not quite
              </>
            )}
          </div>
          <div style={{ fontSize: '13px', color: 'var(--on-surface-variant)', lineHeight: 1.6 }}>
            The missing label is{' '}
            <strong style={{ color: 'var(--success)' }}>
              {question.options[question.correctIndex]}
            </strong>
            .
          </div>
        </div>
      )}

      {mode === 'review' && (
        <div
          style={{
            padding: '14px 18px',
            borderRadius: '12px',
            marginBottom: '12px',
            background:
              reviewIdx !== undefined
                ? reviewIdx === question.correctIndex
                  ? 'rgb(var(--verdict-pass-rgb) / 0.06)'
                  : 'rgb(var(--verdict-fail-rgb) / 0.06)'
                : 'var(--surface-container)',
            border: `1px solid ${
              reviewIdx !== undefined
                ? reviewIdx === question.correctIndex
                  ? 'rgb(var(--verdict-pass-rgb) / 0.2)'
                  : 'rgb(var(--verdict-fail-rgb) / 0.2)'
                : 'var(--outline-variant)'
            }`,
          }}
        >
          {reviewIdx !== undefined ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '14px',
                fontWeight: 700,
                color: reviewIdx === question.correctIndex ? 'var(--success)' : 'var(--error)',
              }}
            >
              {reviewIdx === question.correctIndex ? (
                <>
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }} aria-hidden>
                    check_circle
                  </span>{' '}
                  You answered correctly
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }} aria-hidden>
                    cancel
                  </span>{' '}
                  Correct label:{' '}
                  <strong style={{ color: 'var(--success)' }}>
                    {question.options[question.correctIndex]}
                  </strong>
                </>
              )}
            </div>
          ) : (
            <div style={{ fontSize: '13px', color: 'var(--on-surface-variant)' }}>
              You skipped this question. The missing label is{' '}
              <strong style={{ color: 'var(--success)' }}>
                {question.options[question.correctIndex]}
              </strong>
              .
            </div>
          )}
        </div>
      )}
    </div>
  );
}
