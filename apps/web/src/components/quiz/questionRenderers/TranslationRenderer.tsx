'use client';

import { useState } from 'react';
import MarkdownRenderer from '@/components/ui/MarkdownRenderer';
import type { TranslationPayload } from '@notemage/shared';
import { fuzzyMatch } from '@/lib/quiz-grading';
import { substituteBlankMarker } from './blankPlaceholder';
import HintButton from './HintButton';
import SubmitBar from './SubmitBar';
import type { QuestionProps } from './types';

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

  const inputValue = submittedText ?? draft;
  const inputDisabled = isAnswered || mode === 'review';

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
          <MarkdownRenderer content={substituteBlankMarker(question.question)} />
        </div>
      </div>

      {targetLanguage && (
        <div style={{ display: 'flex', marginBottom: '10px' }}>
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
            <span className="material-symbols-outlined" style={{ fontSize: 12 }} aria-hidden>translate</span> Answer in {targetLanguage}
          </span>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '12px' }}>
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
          placeholder={targetLanguage ? `Type the ${targetLanguage} translation…` : 'Type the translation…'}
          aria-label="Type the translation"
          autoFocus={!inputDisabled}
          style={{
            width: '100%',
            padding: isPhone ? '12px 14px' : '14px 16px',
            minHeight: '48px',
            borderRadius: '12px',
            border: `1px solid ${
              inputDisabled
                ? isCorrect
                  ? 'rgba(74,222,128,0.5)'
                  : 'rgba(252,165,165,0.5)'
                : 'rgba(140,82,255,0.32)'
            }`,
            background: inputDisabled
              ? isCorrect
                ? 'rgba(74,222,128,0.06)'
                : 'rgba(252,165,165,0.06)'
              : 'var(--surface-container)',
            color: inputDisabled
              ? isCorrect
                ? 'var(--success)'
                : 'var(--error)'
              : 'var(--on-surface)',
            fontSize: '16px',
            fontFamily: 'inherit',
            outline: 'none',
          }}
        />

        {!inputDisabled && (
          <SubmitBar
            onClick={submit}
            disabled={draft.trim().length === 0}
            isPhone={isPhone}
          />
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
              color: isCorrect ? 'var(--success)' : 'var(--error)',
            }}
          >
            {isCorrect ? (
              <>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }} aria-hidden>check_circle</span> {mode === 'review' ? 'You answered correctly' : 'Correct!'}
              </>
            ) : (
              <>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }} aria-hidden>cancel</span> {mode === 'review' ? 'You answered incorrectly' : 'Not quite'}
              </>
            )}
          </div>
          <div style={{ fontSize: '13px', color: 'var(--on-surface-variant)', lineHeight: 1.6 }}>
            <MarkdownRenderer
              content={
                isCorrect
                  ? question.correctExplanation || `Accepted answer: ${canonicalAnswer}.`
                  : question.wrongExplanation ||
                    `The correct ${targetLanguage} answer is ${canonicalAnswer}.`
              }
            />
          </div>
        </div>
      )}

      {mode === 'review' && submittedText === undefined && (
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
            You skipped this question. The correct answer is{' '}
            <strong style={{ color: 'var(--success)' }}>{canonicalAnswer}</strong>.
          </div>
        </div>
      )}
    </div>
  );
}
