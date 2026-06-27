'use client';

/* Hallmark · component: code-output quiz · genre: editorial · theme: project (cream / --nm-* + verdict tokens)
 * states: default · hover · focus-visible · disabled · correct · wrong · skipped
 * contrast: pass (uses --surface-* / --on-surface / --nm-* / --verdict-* tokens — theme-flipping, no inline hex)
 * Hallmark · pre-emit critique: P5 H5 E4 S5 R5 V4
 *
 * Figma redesign (Quiz screens): a clean code block + cream answer input that
 * verifies green/red. No fake editor chrome. Body-only — badge/source/card from QuestionCard.
 */

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
  externalChrome,
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

  // Shell flow: stage each keystroke so the sticky ActionBar "Check answer" can
  // commit it; the internal SubmitBar is hidden.
  const onChangeText = (value: string) => {
    setDraft(value);
    if (externalChrome && !isAnswered && mode === 'quiz' && value.trim().length > 0) {
      onSelectAnswer({ kind: 'code_output', text: value.trim() });
    }
  };

  const inputValue = submittedText ?? draft;
  const inputDisabled = isAnswered || mode === 'review';
  const verdict = inputDisabled ? (isCorrect ? 'correct' : 'wrong') : null;

  const langLabel = payload?.language && payload.language !== 'plaintext'
    ? payload.language.charAt(0).toUpperCase() + payload.language.slice(1)
    : null;

  return (
    <div style={{ width: '100%' }}>
      <style>{`
        .qco-textarea:not(:disabled):hover { border-color: var(--nm-primary); }
        .qco-textarea:focus-visible { outline: none; border-color: var(--nm-primary); box-shadow: 0 0 0 3px var(--nm-primary-light); }
      `}</style>

      {/* Prompt heading */}
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
        <MarkdownRenderer content={question.question} />
      </div>
      <p style={{ margin: '0 0 16px', fontSize: '14px', lineHeight: 1.5, color: 'var(--on-surface-variant)' }}>
        Type what this code prints.
      </p>

      {/* Code snippet block — dark mono, no fake window chrome */}
      <div
        style={{
          marginBottom: '16px',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--quiz-card-border)',
          overflow: 'hidden',
        }}
      >
        {langLabel && (
          <div
            style={{
              padding: '6px 14px',
              background: 'var(--surface-container-highest)',
              borderBottom: '1px solid var(--quiz-card-border)',
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--on-surface-variant)',
            }}
          >
            {langLabel}
          </div>
        )}
        <pre
          className="md-renderer"
          style={{
            margin: 0,
            background: 'var(--surface-container-highest)',
            padding: '14px 16px',
            overflowX: 'auto',
            fontSize: '13.5px',
            lineHeight: 1.6,
            color: 'var(--on-surface)',
          }}
        >
          <code
            className="hljs"
            dangerouslySetInnerHTML={{ __html: highlightedHtml }}
            style={{
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
              whiteSpace: 'pre',
            }}
          />
        </pre>
      </div>

      {/* Output input — cream textarea with green/red verdict, copies FillBlank pattern */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '14px' }}>
        <div style={{ position: 'relative' }}>
          <textarea
            className="qco-textarea"
            value={inputValue}
            onChange={(e) => onChangeText(e.target.value)}
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
              padding: isPhone ? '14px 16px' : '15px 18px',
              minHeight: '72px',
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
              fontSize: '14px',
              fontWeight: verdict ? 700 : 500,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
              resize: 'vertical',
              whiteSpace: 'pre',
              transition: 'border-color 0.15s, box-shadow 0.15s',
            }}
          />
          {verdict === 'correct' ? (
            <span
              className="material-symbols-outlined"
              style={{ position: 'absolute', right: '14px', top: '14px', fontSize: 22, color: 'var(--success)' }}
              aria-hidden
            >
              check_circle
            </span>
          ) : null}
        </div>

        {!externalChrome && !inputDisabled && (
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
                  ? question.correctExplanation || `Expected output: ${canonicalAnswer}.`
                  : question.wrongExplanation || `The expected output is \`${canonicalAnswer}\`.`
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
            You skipped this question. Expected output:{' '}
            <strong style={{ color: 'var(--success)' }}>{canonicalAnswer}</strong>.
          </div>
        </div>
      )}
    </div>
  );
}
