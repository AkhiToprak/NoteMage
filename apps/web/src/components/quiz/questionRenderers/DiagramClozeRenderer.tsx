'use client';

/* Hallmark · component: diagram-cloze quiz options · genre: editorial · theme: project (cream / --nm-* + verdict tokens)
 * states: default · hover · focus-visible · active · disabled · selected · correct · wrong
 * contrast: pass (uses --surface-* / --on-surface / --nm-* / --verdict-* tokens — theme-flipping, no inline hex)
 * Hallmark · pre-emit critique: P5 H5 E4 S5 R5 V4
 *
 * Figma redesign (Quiz screens): a framed diagram + cream Multiple-Choice option
 * rows for the masked label. Body-only — badge, source chip and white card come from QuestionCard.
 */

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
// Design: cream design tokens only (no hex), no transition-all (only
// border-color/background/transform transitions), every option has
// hover/:focus-visible (visible ring)/active, ≥44px touch targets, terse copy,
// light-mode safe. diagram_cloze is a SELECT kind — onSelectAnswer fires on
// click with no SubmitBar; QuizViewer advances automatically.
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
  const locked = isAnswered || mode === 'review';

  return (
    <div style={{ width: '100%' }}>
      <style>{`
        .qdc-opt {
          transition: border-color 0.18s cubic-bezier(0.22, 1, 0.36, 1),
                      background-color 0.18s cubic-bezier(0.22, 1, 0.36, 1),
                      transform 0.18s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .qdc-opt:not(:disabled):hover { border-color: var(--nm-primary); }
        .qdc-opt:not(:disabled):hover .qdc-badge { background: var(--nm-primary-light); }
        .qdc-opt:not(:disabled):active { transform: translateY(1px); }
        .qdc-opt:focus-visible {
          outline: 2px solid var(--color-focus);
          outline-offset: 2px;
          border-color: var(--nm-primary);
        }
        @media (prefers-reduced-motion: reduce) {
          .qdc-opt { transition: none; }
          .qdc-opt:not(:disabled):active { transform: none; }
        }
      `}</style>

      {/* Prompt — large display heading on the white card (no dark sub-card). */}
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
        Pick the missing label.
      </p>

      {/* Diagram image container — cream-framed, centred, masked label stays visible as "?" chip. */}
      {diagram ? (
        <div
          style={{
            background: 'var(--quiz-bg)',
            border: '1px solid var(--quiz-card-border)',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            marginBottom: '20px',
            padding: '16px',
            overflow: 'hidden',
          }}
        >
          <PathDiagram diagram={diagram} maskMarker={DIAGRAM_CLOZE_MASK} />
        </div>
      ) : null}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '14px' }}>
        {displayOrder.map((origIdx, pos) => {
          const option = question.options[origIdx];
          const letter = String.fromCharCode(65 + pos);
          const isSelected = selectedIdx === origIdx;
          const isCorrectOption = question.correctIndex === origIdx;
          const showResult = isAnswered || mode === 'review';
          const reviewSelected = mode === 'review' && reviewIdx === origIdx;
          const markedWrong = (isSelected || reviewSelected) && !isCorrectOption;

          // Row variant → token-composed surfaces. Order matters: a correct row
          // always reads green even if it was the one selected.
          let bg = 'var(--surface-container-lowest)';
          let borderColor = 'var(--outline-variant)';
          const textColor = 'var(--on-surface)';
          let badgeBg = 'var(--nm-primary-light)';
          let badgeColor = 'var(--nm-primary-on-light)';
          let badgeContent: React.ReactNode = letter;
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
              key={origIdx}
              type="button"
              className="qdc-opt"
              onClick={() => onSelectAnswer({ kind: 'diagram_cloze', selectedIdx: origIdx })}
              disabled={locked}
              aria-pressed={isSelected}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: isPhone ? '12px' : '14px',
                padding: isPhone ? '13px 14px' : '15px 18px',
                minHeight: '56px',
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
                className="qdc-badge"
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
              <span style={{ fontSize: '16px', color: textColor, flex: 1, lineHeight: 1.5 }}>
                <MarkdownRenderer content={option} />
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
                    `The missing label is ${question.options[question.correctIndex]}.`
                  : question.wrongExplanation ||
                    `The correct label is ${question.options[question.correctIndex]}.`
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
              reviewIdx !== undefined
                ? reviewIdx === question.correctIndex
                  ? 'rgb(var(--verdict-pass-rgb) / 0.08)'
                  : 'rgb(var(--verdict-fail-rgb) / 0.08)'
                : 'var(--surface-container)',
            border: `1px solid ${
              reviewIdx !== undefined
                ? reviewIdx === question.correctIndex
                  ? 'rgb(var(--verdict-pass-rgb) / 0.3)'
                  : 'rgb(var(--verdict-fail-rgb) / 0.3)'
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
                  fontSize: '15px',
                  fontWeight: 800,
                  marginBottom: '6px',
                  color: reviewIdx === question.correctIndex ? 'var(--success)' : 'var(--error)',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 18 }} aria-hidden>
                  {reviewIdx === question.correctIndex ? 'check_circle' : 'cancel'}
                </span>
                {reviewIdx === question.correctIndex
                  ? 'You answered correctly'
                  : 'You answered incorrectly'}
              </div>
              <div style={{ fontSize: '14px', color: 'var(--on-surface-variant)', lineHeight: 1.6 }}>
                <MarkdownRenderer
                  content={
                    reviewIdx === question.correctIndex
                      ? question.correctExplanation ||
                        `The missing label is ${question.options[question.correctIndex]}.`
                      : question.wrongExplanation ||
                        `The correct label is ${question.options[question.correctIndex]}.`
                  }
                />
              </div>
            </>
          ) : (
            <div style={{ fontSize: '14px', color: 'var(--on-surface-variant)' }}>
              You skipped this question. The correct label is{' '}
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
