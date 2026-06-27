'use client';

/* Hallmark · component: translation quiz · genre: editorial · theme: project (cream / --nm-* + verdict tokens)
 * states: default · hover · focus-visible · disabled · correct · wrong · skipped
 * contrast: pass (uses --surface-* / --on-surface / --nm-* / --verdict-* tokens — theme-flipping, no inline hex)
 * Hallmark · pre-emit critique: P5 H5 E4 S5 R5 V4
 *
 * Figma redesign (Quiz screens): a clean cream translation input that verifies
 * green/red. Body-only — badge, source chip and white card come from QuestionCard.
 */

import { useState } from 'react';
import MarkdownRenderer from '@/components/ui/MarkdownRenderer';
import type { TranslationPayload } from '@notemage/shared';
import { fuzzyMatch } from '@/lib/quiz-grading';
import { substituteBlankMarker } from './blankPlaceholder';
import type { QuestionProps } from './types';
import HintButton from './HintButton';
import SubmitBar from './SubmitBar';

export default function TranslationRenderer({
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
  externalChrome,
}: QuestionProps<TranslationPayload | null>) {
  const payload = question.payload;
  const [draft, setDraft] = useState('');

  const submittedText =
    mode === 'review'
      ? reviewAnswer?.kind === 'translation'
        ? reviewAnswer.text
        : undefined
      : currentAnswer?.kind === 'translation'
        ? currentAnswer.text
        : undefined;

  // QuizViewer keys this component by question.id, so navigation unmounts
  // and remounts — useState initializes to '' on each mount.

  const isCorrect = (() => {
    if (!payload || submittedText === undefined) return false;
    return fuzzyMatch(
      submittedText,
      payload.blank.acceptableAnswers,
      payload.blank.fuzzyThreshold ?? 0.75,
      payload.blank.caseSensitive ?? false
    );
  })();

  const canonicalAnswer = payload?.blank.acceptableAnswers[0] ?? '';
  const targetLanguage = payload?.targetLanguage ?? '';

  const submit = () => {
    if (isAnswered || mode === 'review') return;
    const text = draft.trim();
    if (text.length === 0) return;
    onSelectAnswer({ kind: 'translation', text });
  };

  // Shell flow: stage each keystroke so the sticky ActionBar "Check answer" can
  // commit it; the internal SubmitBar is hidden.
  const onChangeText = (value: string) => {
    setDraft(value);
    if (externalChrome && !isAnswered && mode === 'quiz' && value.trim().length > 0) {
      onSelectAnswer({ kind: 'translation', text: value.trim() });
    }
  };

  const inputValue = submittedText ?? draft;
  const inputDisabled = isAnswered || mode === 'review';
  const verdict = inputDisabled ? (isCorrect ? 'correct' : 'wrong') : null;

  return (
    <div style={{ width: '100%' }}>
      <style>{`
        .qtr-input:not(:disabled):hover { border-color: var(--nm-primary); }
        .qtr-input:focus-visible { outline: none; border-color: var(--nm-primary); box-shadow: 0 0 0 3px var(--nm-primary-light); }
      `}</style>

      {/* Prompt — the sentence or phrase to translate. */}
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: isPhone ? '20px' : 'clamp(22px, 2.2vw, 28px)',
          fontWeight: 800,
          lineHeight: 1.3,
          letterSpacing: '-0.01em',
          color: 'var(--on-surface)',
          marginBottom: '6px',
        }}
      >
        <MarkdownRenderer content={substituteBlankMarker(question.question)} />
      </div>

      <p style={{ margin: '0 0 16px', fontSize: '14px', lineHeight: 1.5, color: 'var(--on-surface-variant)' }}>
        {targetLanguage ? `Type your translation in ${targetLanguage}.` : 'Type your translation.'}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '14px' }}>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <input
            className="qtr-input"
            value={inputValue}
            onChange={(e) => onChangeText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submit();
              }
            }}
            disabled={inputDisabled}
            placeholder={targetLanguage ? `Type the ${targetLanguage} translation…` : 'Type the translation…'}
            aria-label="Type the translation"
            autoFocus={!inputDisabled}
            style={{
              width: '100%',
              padding: isPhone ? '14px 16px' : '15px 18px',
              paddingRight: verdict === 'correct' ? '44px' : undefined,
              minHeight: '54px',
              borderRadius: 'var(--radius-md)',
              border: `1.5px solid ${
                verdict === 'correct'
                  ? 'rgb(var(--verdict-pass-rgb) / 0.6)'
                  : verdict === 'wrong'
                    ? 'rgb(var(--verdict-fail-rgb) / 0.6)'
                    : 'var(--outline-variant)'
              }`,
              background:
                verdict === 'correct'
                  ? 'rgb(var(--verdict-pass-rgb) / 0.08)'
                  : verdict === 'wrong'
                    ? 'rgb(var(--verdict-fail-rgb) / 0.08)'
                    : 'var(--surface-container-lowest)',
              color:
                verdict === 'correct'
                  ? 'var(--success)'
                  : verdict === 'wrong'
                    ? 'var(--error)'
                    : 'var(--on-surface)',
              fontSize: '16px',
              fontWeight: verdict ? 700 : 500,
              fontFamily: 'inherit',
              transition: 'border-color 0.15s, box-shadow 0.15s',
            }}
          />
          {verdict === 'correct' ? (
            <span
              className="material-symbols-outlined"
              style={{ position: 'absolute', right: '14px', fontSize: 22, color: 'var(--success)' }}
              aria-hidden
            >
              check_circle
            </span>
          ) : null}
        </div>

        {!externalChrome && !inputDisabled && (
          <SubmitBar onClick={submit} disabled={draft.trim().length === 0} isPhone={isPhone} />
        )}
      </div>

      <HintButton
        hint={question.hint}
        showHint={showHint}
        onToggle={onToggleHint}
        isAnswered={isAnswered}
        mode={mode}
        coarsePointer={coarsePointer}
      />

      {(isAnswered || (mode === 'review' && submittedText !== undefined)) && (
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
            {isCorrect
              ? mode === 'review'
                ? 'You answered correctly'
                : 'Correct'
              : mode === 'review'
                ? 'You answered incorrectly'
                : 'Not quite'}
          </div>
          <div style={{ fontSize: '14px', color: 'var(--on-surface-variant)', lineHeight: 1.6 }}>
            <MarkdownRenderer
              content={
                isCorrect
                  ? question.correctExplanation || `Accepted answer: ${canonicalAnswer}.`
                  : question.wrongExplanation ||
                    `The correct${targetLanguage ? ` ${targetLanguage}` : ''} answer is ${canonicalAnswer}.`
              }
            />
          </div>
        </div>
      )}

      {mode === 'review' && submittedText === undefined && (
        <div
          style={{
            padding: '16px 18px',
            borderRadius: 'var(--radius-md)',
            marginBottom: '12px',
            background: 'var(--surface-container)',
            border: '1px solid var(--ink-08)',
          }}
        >
          <div style={{ fontSize: '14px', color: 'var(--on-surface-variant)' }}>
            You skipped this question. The correct answer is{' '}
            <strong style={{ color: 'var(--success)' }}>{canonicalAnswer}</strong>.
          </div>
        </div>
      )}
    </div>
  );
}
