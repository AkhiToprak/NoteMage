'use client';

import MarkdownRenderer from '@/components/ui/MarkdownRenderer';
import type { McPayload } from '@notemage/shared';
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
        {question.options.map((option, i) => {
          const letter = String.fromCharCode(65 + i);
          const isSelected = selectedIdx === i;
          const isCorrectOption = question.correctIndex === i;
          const showResult = isAnswered || mode === 'review';
          const reviewSelected = mode === 'review' && reviewIdx === i;

          let borderColor = 'rgba(140,82,255,0.15)';
          let bg = 'rgba(255,255,255,0.07)';
          let textColor = 'rgba(237,233,255,0.7)';

          if (showResult) {
            if (isCorrectOption) {
              borderColor = 'rgba(74,222,128,0.5)';
              bg = 'rgba(74,222,128,0.08)';
              textColor = '#4ade80';
            } else if (isSelected || reviewSelected) {
              borderColor = 'rgba(252,165,165,0.5)';
              bg = 'rgba(252,165,165,0.08)';
              textColor = '#fca5a5';
            }
          } else if (isSelected) {
            borderColor = 'rgba(140,82,255,0.5)';
            bg = 'rgba(140,82,255,0.12)';
            textColor = '#c4a9ff';
          }

          return (
            <button
              key={i}
              onClick={() => onSelectAnswer({ kind: 'mc', selectedIdx: i })}
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
                      ? 'rgba(74,222,128,0.15)'
                      : showResult && (isSelected || reviewSelected)
                        ? 'rgba(252,165,165,0.15)'
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
                {option}
              </span>
            </button>
          );
        })}
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
            color: '#fbbf24',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
            marginBottom: '12px',
            fontFamily: 'inherit',
            transition: 'background 0.12s',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 13 }} aria-hidden>lightbulb</span>
          {showHint ? 'Hide Hint' : coarsePointer ? 'Show Hint' : 'Show Hint (H)'}
        </button>
      )}
      {showHint && question.hint && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: '10px',
            background: 'rgba(251,191,36,0.06)',
            border: '1px solid rgba(251,191,36,0.15)',
            fontSize: '13px',
            color: 'rgba(251,191,36,0.8)',
            marginBottom: '12px',
            lineHeight: 1.6,
          }}
        >
          {question.hint}
        </div>
      )}

      {isAnswered && (
        <div
          style={{
            padding: '14px 18px',
            borderRadius: '12px',
            background: isCorrect ? 'rgba(74,222,128,0.06)' : 'rgba(252,165,165,0.06)',
            border: `1px solid ${isCorrect ? 'rgba(74,222,128,0.2)' : 'rgba(252,165,165,0.2)'}`,
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
              color: isCorrect ? '#4ade80' : '#fca5a5',
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
          <div style={{ fontSize: '13px', color: 'rgba(237,233,255,0.6)', lineHeight: 1.6 }}>
            {isCorrect
              ? question.correctExplanation ||
                `The answer is ${question.options[question.correctIndex]}.`
              : question.wrongExplanation ||
                `The correct answer is ${question.options[question.correctIndex]}.`}
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
                  ? 'rgba(74,222,128,0.06)'
                  : 'rgba(252,165,165,0.06)'
                : 'rgba(255,255,255,0.07)',
            border: `1px solid ${
              reviewIdx !== undefined
                ? reviewIdx === question.correctIndex
                  ? 'rgba(74,222,128,0.2)'
                  : 'rgba(252,165,165,0.2)'
                : 'rgba(255,255,255,0.06)'
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
                  color: reviewIdx === question.correctIndex ? '#4ade80' : '#fca5a5',
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
              <div style={{ fontSize: '13px', color: 'rgba(237,233,255,0.6)', lineHeight: 1.6 }}>
                {reviewIdx === question.correctIndex
                  ? question.correctExplanation ||
                    `The answer is ${question.options[question.correctIndex]}.`
                  : question.wrongExplanation ||
                    `The correct answer is ${question.options[question.correctIndex]}.`}
              </div>
            </>
          ) : (
            <div style={{ fontSize: '13px', color: 'rgba(237,233,255,0.4)' }}>
              You skipped this question. The correct answer is{' '}
              <strong style={{ color: '#4ade80' }}>
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
