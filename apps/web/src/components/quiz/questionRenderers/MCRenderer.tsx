'use client';

import { useMemo } from 'react';
import MarkdownRenderer from '@/components/ui/MarkdownRenderer';
import type { McPayload } from '@notemage/shared';
import { shuffleByKey } from './quizShuffle';
import HintButton from './HintButton';
import type { QuestionProps } from './types';

// MCRenderer renders a multiple-choice question. Phase 1 reads the answer
// data from legacy `options` + `correctIndex` columns on the question;
// `payload` may be null for legacy rows (Phase 7 backfills it). New
// AI-generated questions still hydrate `options` + `correctIndex` for this
// release, so both code paths read from the same place.
export default function MCRenderer({
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
}: QuestionProps<McPayload | null>) {
  const selectedIdx = currentAnswer?.kind === 'mc' ? currentAnswer.selectedIdx : undefined;
  const reviewIdx = reviewAnswer?.kind === 'mc' ? reviewAnswer.selectedIdx : undefined;
  const isCorrect = isAnswered && selectedIdx === question.correctIndex;

  // Present options in a content-independent order so the correct answer's
  // position can't be predicted from how the AI happened to emit them (models
  // cluster the right answer even when told to spread it). Seeded by
  // question.id so the order is stable across re-renders — no reshuffle
  // mid-attempt. We shuffle the option INDICES, so `selectedIdx` still refers
  // to the original option index and grading (server + client) is untouched.
  const displayOrder = useMemo(
    () => shuffleByKey(question.options.map((_, i) => i), question.id),
    [question.options, question.id]
  );

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

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
        {displayOrder.map((origIdx, pos) => {
          const option = question.options[origIdx];
          const letter = String.fromCharCode(65 + pos);
          const isSelected = selectedIdx === origIdx;
          const isCorrectOption = question.correctIndex === origIdx;
          const showResult = isAnswered || mode === 'review';
          const reviewSelected = mode === 'review' && reviewIdx === origIdx;

          let borderColor = 'rgba(140,82,255,0.15)';
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
            borderColor = 'rgba(140,82,255,0.5)';
            bg = 'rgba(140,82,255,0.12)';
            textColor = 'var(--accent-strong)';
          }

          return (
            <button
              key={origIdx}
              onClick={() => onSelectAnswer({ kind: 'mc', selectedIdx: origIdx })}
              disabled={isAnswered || mode === 'review'}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: isPhone ? '10px' : '12px',
                padding: isPhone ? '12px 14px' : '14px 16px',
                minHeight: '44px',
                borderRadius: '12px',
                border: `1px solid ${borderColor}`,
                background: bg,
                cursor: isAnswered || mode === 'review' ? 'default' : 'pointer',
                textAlign: 'left',
                fontFamily: 'inherit',
                transition: 'background 0.15s, border-color 0.15s',
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
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }} aria-hidden>check_circle</span>
                ) : showResult && (isSelected || reviewSelected) ? (
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }} aria-hidden>cancel</span>
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
            background: isCorrect ? 'rgb(var(--verdict-pass-rgb) / 0.06)' : 'rgb(var(--verdict-fail-rgb) / 0.06)',
            border: `1px solid ${isCorrect ? 'rgb(var(--verdict-pass-rgb) / 0.2)' : 'rgb(var(--verdict-fail-rgb) / 0.2)'}`,
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
                <span className="material-symbols-outlined" style={{ fontSize: 16 }} aria-hidden>check_circle</span> Correct!
              </>
            ) : (
              <>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }} aria-hidden>cancel</span> Not quite
              </>
            )}
          </div>
          <div style={{ fontSize: '13px', color: 'var(--on-surface-variant)', lineHeight: 1.6 }}>
            <MarkdownRenderer
              content={
                isCorrect
                  ? question.correctExplanation ||
                    `The answer is ${question.options[question.correctIndex]}.`
                  : question.wrongExplanation ||
                    `The correct answer is ${question.options[question.correctIndex]}.`
              }
            />
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
                : 'var(--ink-08)'
            }`,
          }}
        >
          {reviewIdx !== undefined ? (
            <>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '14px',
                  fontWeight: 700,
                  marginBottom: '6px',
                  color: reviewIdx === question.correctIndex ? 'var(--success)' : 'var(--error)',
                }}
              >
                {reviewIdx === question.correctIndex ? (
                  <>
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }} aria-hidden>check_circle</span> You answered correctly
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }} aria-hidden>cancel</span> You answered incorrectly
                  </>
                )}
              </div>
              <div style={{ fontSize: '13px', color: 'var(--on-surface-variant)', lineHeight: 1.6 }}>
                <MarkdownRenderer
                  content={
                    reviewIdx === question.correctIndex
                      ? question.correctExplanation ||
                        `The answer is ${question.options[question.correctIndex]}.`
                      : question.wrongExplanation ||
                        `The correct answer is ${question.options[question.correctIndex]}.`
                  }
                />
              </div>
            </>
          ) : (
            <div style={{ fontSize: '13px', color: 'var(--on-surface-variant)' }}>
              You skipped this question. The correct answer is{' '}
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
