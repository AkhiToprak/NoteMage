'use client';

import { useMemo, useState } from 'react';
import { all, createLowlight } from 'lowlight';
import { toHtml } from 'hast-util-to-html';
import MarkdownRenderer from '@/components/ui/MarkdownRenderer';
import type { CodeOutputPayload } from '@notemage/shared';
import { fuzzyMatch } from '@/lib/quiz-grading';
import type { QuestionProps } from './types';
import HintButton from './HintButton';
import SubmitBar from './SubmitBar';

const lowlight = createLowlight(all);

function highlight(code: string, lang: string): string {
  try {
    if (lang === 'plaintext') {
      return code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    const tree = lowlight.registered(lang)
      ? lowlight.highlight(lang, code)
      : lowlight.highlightAuto(code);
    return toHtml(tree);
  } catch {
    return code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}

export default function CodeOutputRenderer({
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
}: QuestionProps<CodeOutputPayload | null>) {
  const payload = question.payload;
  const [draft, setDraft] = useState('');

  const submittedText =
    mode === 'review'
      ? reviewAnswer?.kind === 'code_output'
        ? reviewAnswer.text
        : undefined
      : currentAnswer?.kind === 'code_output'
        ? currentAnswer.text
        : undefined;

  const highlightedHtml = useMemo(() => {
    if (!payload) return '';
    return highlight(payload.code, payload.language);
  }, [payload]);

  const isCorrect = (() => {
    if (!payload || submittedText === undefined) return false;
    return fuzzyMatch(
      submittedText,
      payload.blank.acceptableAnswers,
      payload.blank.fuzzyThreshold ?? 0.95,
      payload.blank.caseSensitive ?? true
    );
  })();

  const canonicalAnswer = payload?.blank.acceptableAnswers[0] ?? '';

  const submit = () => {
    if (isAnswered || mode === 'review') return;
    const text = draft;
    if (text.trim().length === 0) return;
    onSelectAnswer({ kind: 'code_output', text });
  };

  const inputValue = submittedText ?? draft;
  const inputDisabled = isAnswered || mode === 'review';

  return (
    <div
      style={{
        width: '100%',
        maxWidth: isPhone ? '100%' : '560px',
        marginBottom: '20px',
      }}
    >
      <div
        style={{
          background: 'var(--quiz-question-surface)',
          border: '1px solid rgba(174,137,255,0.38)',
          borderRadius: '16px',
          padding: isPhone ? '20px 16px' : '24px 22px',
          marginBottom: '16px',
          minWidth: 0,
          boxShadow: '0 2px 14px rgba(0,0,0,0.55), inset 0 1px 0 rgba(196,169,255,0.10)',
        }}
      >
        <div style={{ fontSize: '18px', color: '#f5f1ff', lineHeight: 1.6, marginBottom: '14px' }}>
          <MarkdownRenderer content={question.question} />
        </div>

        <div style={{ display: 'flex', marginBottom: '10px' }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: 'rgba(140,82,255,0.16)',
              border: '1px solid rgba(140,82,255,0.35)',
              borderRadius: '999px',
              padding: '4px 12px',
              fontSize: '11px',
              fontWeight: 700,
              color: '#c4a9ff',
              fontFamily: 'inherit',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 12 }} aria-hidden>code</span> {payload?.language ?? 'code'}
          </span>
        </div>

        <pre
          className="md-renderer"
          style={{
            margin: 0,
            background: 'rgba(0,0,0,0.55)',
            border: '1px solid rgba(174,137,255,0.36)',
            borderRadius: '10px',
            padding: '14px 16px',
            overflowX: 'auto',
            fontSize: '13.5px',
            lineHeight: 1.55,
            color: '#ede4ff',
          }}
        >
          <code
            className="hljs"
            dangerouslySetInnerHTML={{ __html: highlightedHtml }}
            style={{
              fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
              whiteSpace: 'pre',
            }}
          />
        </pre>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '12px' }}>
        <textarea
          value={inputValue}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            }
          }}
          disabled={inputDisabled}
          placeholder="Type the printed output…"
          aria-label="Type the expected output"
          rows={3}
          autoFocus={!inputDisabled}
          style={{
            width: '100%',
            padding: isPhone ? '12px 14px' : '14px 16px',
            minHeight: '72px',
            borderRadius: '12px',
            border: `1px solid ${
              inputDisabled
                ? isCorrect
                  ? 'rgb(var(--verdict-pass-rgb) / 0.5)'
                  : 'rgb(var(--verdict-fail-rgb) / 0.5)'
                : 'rgba(140,82,255,0.32)'
            }`,
            background: inputDisabled
              ? isCorrect
                ? 'rgb(var(--verdict-pass-rgb) / 0.06)'
                : 'rgb(var(--verdict-fail-rgb) / 0.06)'
              : 'var(--surface-container)',
            color: inputDisabled
              ? isCorrect
                ? 'var(--success)'
                : 'var(--error)'
              : 'var(--on-surface)',
            fontSize: '14px',
            fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
            resize: 'vertical',
            whiteSpace: 'pre',
          }}
        />

        {!inputDisabled && (
          <SubmitBar
            onClick={submit}
            disabled={draft.trim().length === 0}
            label="Submit output"
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
                  ? question.correctExplanation || `Expected output: ${canonicalAnswer}.`
                  : question.wrongExplanation || `The expected output is ${canonicalAnswer}.`
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
            You skipped this question. Expected output:{' '}
            <strong style={{ color: 'var(--success)' }}>{canonicalAnswer}</strong>.
          </div>
        </div>
      )}
    </div>
  );
}
