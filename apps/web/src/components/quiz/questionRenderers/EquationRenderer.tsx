'use client';

/* Hallmark · component: calculation / equation quiz · genre: editorial · theme: project (cream / --nm-* + verdict tokens)
 * states: default · hover · focus-visible · active · disabled · correct · wrong · skipped
 * contrast: pass (uses --surface-* / --on-surface / --nm-* / --verdict-* tokens — theme-flipping, no inline hex)
 * Hallmark · pre-emit critique: P5 H5 E4 S5 R5 V4
 *
 * Figma redesign (Quiz screens · "Calculation"): a cream "Your answer" field that
 * verifies green with a trailing check, the real math-symbol palette + live KaTeX
 * grading preview kept intact (a genuine input, not decorative chrome), and a
 * step-by-step feedback block. Body-only — the type badge, source chip and white
 * card come from QuestionCard. Tokens stay semantic so dark mode keeps working;
 * the study-pack page keeps its SubmitBar (externalChrome falsy).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import katex from 'katex';
import MarkdownRenderer from '@/components/ui/MarkdownRenderer';
import { safeParse } from '@/lib/safe-math';
import { extractGradingCandidate } from '@/lib/quiz-grading';
import type { EquationPayload } from '@notemage/shared';
import type { QuestionProps } from './types';
import HintButton from './HintButton';
import SubmitBar from './SubmitBar';

// Hard cap mirrored from quiz-grading's MAX_EQUATION_CHARS: the grader rejects
// anything longer, so neither typing nor a palette insert should build past it.
const MAX_EQUATION_CHARS = 256;

// Caret-inserting math shortcuts shown above the input. Each key emits the ASCII
// the grader speaks natively (`×`→`*`, `÷`→`/`, `π`→`pi`, `√`→`sqrt()`); the
// glyph on the button is just a friendly label. `caretBack` lands the caret
// inside an inserted wrapper — e.g. between `sqrt()`'s parens, or in the first
// group of a fraction.
interface PaletteKey {
  glyph: string;
  insert: string;
  caretBack?: number;
  title: string;
}

const PALETTE: PaletteKey[] = [
  { glyph: '√', insert: 'sqrt()', caretBack: 1, title: 'Square root' },
  { glyph: 'x²', insert: '^2', title: 'Square' },
  { glyph: '^', insert: '^', title: 'Power' },
  { glyph: '⁄', insert: '()/()', caretBack: 4, title: 'Fraction' },
  { glyph: 'π', insert: 'pi', title: 'Pi' },
  { glyph: '×', insert: '*', title: 'Multiply' },
  { glyph: '÷', insert: '/', title: 'Divide' },
  { glyph: '±', insert: '±', title: 'Plus or minus' },
  { glyph: '(', insert: '(', title: 'Open parenthesis' },
  { glyph: ')', insert: ')', title: 'Close parenthesis' },
  { glyph: '=', insert: '=', title: 'Equals' },
];

// ASCII expression → KaTeX HTML via mathjs `toTex()`. `safeParse` is the hardened
// untrusted-input entry point; `toTex()` is pure serialization of an already
// parsed AST, and KaTeX renders with `throwOnError:false`. Returns null when the
// expression can't be parsed/serialized so the caller can show a hint instead of
// a broken render.
function asciiToKatexHtml(ascii: string): string | null {
  try {
    const tex = safeParse(ascii).toTex();
    return katex.renderToString(tex, { throwOnError: false, strict: 'ignore' });
  } catch {
    return null;
  }
}

export default function EquationRenderer({
  question,
  mode,
  isAnswered,
  currentAnswer,
  reviewAnswer,
  gradedCorrect,
  showHint,
  onToggleHint,
  onSelectAnswer,
  isPhone,
  coarsePointer,
  externalChrome,
}: QuestionProps<EquationPayload | null>) {
  const payload = question.payload;
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

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
  const expectedExpression = payload?.expectedExpression ?? '';

  const inputValue = submittedExpression ?? draft;
  const inputDisabled = isAnswered || mode === 'review';

  const submit = () => {
    if (isAnswered || mode === 'review') return;
    const expression = draft.trim();
    if (expression.length === 0) return;
    onSelectAnswer({ kind: 'equation', expression });
  };

  // Shell flow: stage the (non-empty) expression continuously — covers both
  // typing and palette inserts — so the sticky ActionBar "Check answer" can
  // commit it; the internal SubmitBar is hidden.
  useEffect(() => {
    if (!externalChrome || isAnswered || mode !== 'quiz') return;
    if (draft.trim().length === 0) return;
    onSelectAnswer({ kind: 'equation', expression: draft.trim() });
  }, [externalChrome, isAnswered, mode, draft, onSelectAnswer]);

  // Splice a palette glyph in at the caret (or over the selection), then restore
  // focus + caret once React commits the controlled value. `onMouseDown`
  // preventDefault on the buttons keeps the input focused so selectionStart/End
  // are still valid here; setSelectionRange runs after the re-render so it sticks
  // on iOS WebView too (B4.9).
  const insertSymbol = (key: PaletteKey) => {
    if (inputDisabled) return;
    const el = inputRef.current;
    const start = el?.selectionStart ?? draft.length;
    const end = el?.selectionEnd ?? draft.length;
    const next = draft.slice(0, start) + key.insert + draft.slice(end);
    if (next.length > MAX_EQUATION_CHARS) return;
    setDraft(next);
    const caret = start + key.insert.length - (key.caretBack ?? 0);
    requestAnimationFrame(() => {
      const node = inputRef.current;
      if (!node) return;
      node.focus();
      node.setSelectionRange(caret, caret);
    });
  };

  // Debounce the live preview so KaTeX doesn't re-render on every keystroke.
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setDebounced(draft), 180);
    return () => clearTimeout(id);
  }, [draft]);

  // Live "Grading: …" preview of the exact candidate the grader will try first
  // (extractGradingCandidate is the same normalize→extract pipeline grade() uses,
  // so the preview can never disagree with the verdict). ok:false → the gentle
  // can't-read hint, which surfaces a malformed answer *before* submit.
  const preview = useMemo(() => {
    if (debounced.trim().length === 0) return null;
    const candidate = extractGradingCandidate(debounced);
    if (!candidate) return { ok: false as const };
    const html = asciiToKatexHtml(candidate);
    return html ? { ok: true as const, html } : { ok: false as const };
  }, [debounced]);

  // Expected answer rendered as math on wrong-answer / skipped feedback (legacy
  // `=`-bearing expecteds self-heal to their final-answer form). Falls back to
  // raw ASCII in the caller when this is null.
  const expectedHtml = useMemo(() => {
    if (expectedExpression.length === 0) return null;
    const canonical = extractGradingCandidate(expectedExpression) ?? expectedExpression;
    return asciiToKatexHtml(canonical);
  }, [expectedExpression]);

  // The authoritative verdict is the graded result threaded in from QuizViewer
  // (grade() already evaluated symbolic equivalence at submit time). Fall back
  // to a literal string match only if it's somehow missing, so a correct-but-
  // not-identical answer (e.g. "3+2*x" for "2*x+3") is no longer mislabelled.
  const matchedLiteral =
    submittedExpression !== undefined &&
    expectedExpression.length > 0 &&
    normalize(submittedExpression) === normalize(expectedExpression);
  const correct = gradedCorrect ?? matchedLiteral;
  const verdict = submittedExpression !== undefined ? (correct ? 'correct' : 'wrong') : null;

  return (
    <div style={{ width: '100%' }}>
      <style>{`
        .eq-key {
          transition: background-color 0.15s cubic-bezier(0.22,1,0.36,1),
                      border-color 0.15s cubic-bezier(0.22,1,0.36,1),
                      transform 0.12s cubic-bezier(0.22,1,0.36,1);
        }
        .eq-key:hover { background: var(--nm-primary-light); border-color: var(--nm-primary); }
        .eq-key:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 2px; }
        .eq-key:active { transform: translateY(1px); }
        .eq-input:not(:disabled):hover { border-color: var(--nm-primary); }
        .eq-input:focus-visible { outline: none; border-color: var(--nm-primary); box-shadow: 0 0 0 3px var(--nm-primary-light); }
        @media (prefers-reduced-motion: reduce) { .eq-key { transition: none; } .eq-key:active { transform: none; } }
      `}</style>

      {/* Prompt — large display heading on the white card. */}
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: isPhone ? '20px' : 'clamp(22px, 2.2vw, 28px)',
          fontWeight: 800,
          lineHeight: 1.3,
          letterSpacing: '-0.01em',
          color: 'var(--on-surface)',
          marginBottom: '14px',
        }}
      >
        <MarkdownRenderer content={question.question} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '14px' }}>
        <span
          style={{
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: 'var(--on-surface-variant)',
          }}
        >
          Your answer
        </span>

        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <input
            ref={inputRef}
            className="eq-input"
            value={inputValue}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submit();
              }
            }}
            disabled={inputDisabled}
            maxLength={MAX_EQUATION_CHARS}
            placeholder="e.g. x = 5,  2*x + 3,  sqrt(16)"
            aria-label="Type your equation answer"
            autoFocus={!inputDisabled}
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
            style={{
              width: '100%',
              padding: isPhone ? '13px 14px' : '15px 18px',
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
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
              letterSpacing: '0.02em',
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

        {!inputDisabled && (
          <div
            role="group"
            aria-label="Insert math symbols"
            style={{ display: 'flex', flexWrap: 'wrap', gap: coarsePointer ? '8px' : '6px' }}
          >
            {PALETTE.map((key) => (
              <button
                key={key.glyph}
                type="button"
                className="eq-key"
                title={key.title}
                aria-label={key.title}
                // Keep the input focused (and its caret intact) so insertSymbol
                // can read selectionStart/End.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => insertSymbol(key)}
                style={{
                  minWidth: coarsePointer ? '44px' : '38px',
                  minHeight: coarsePointer ? '44px' : '38px',
                  padding: '0 10px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--outline-variant)',
                  background: 'var(--surface-container-lowest)',
                  color: 'var(--on-surface)',
                  fontSize: coarsePointer ? '17px' : '15px',
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                  lineHeight: 1,
                  cursor: 'pointer',
                }}
              >
                {key.glyph}
              </button>
            ))}
          </div>
        )}

        {!inputDisabled && preview && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              minHeight: '34px',
              padding: '8px 14px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--quiz-bg)',
              border: '1px solid var(--quiz-card-border)',
              color: 'var(--on-surface)',
              overflowX: 'auto',
            }}
          >
            {preview.ok ? (
              <>
                <span
                  style={{
                    flexShrink: 0,
                    fontSize: '10px',
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    color: 'var(--on-surface-variant)',
                  }}
                >
                  Grading
                </span>
                <span style={{ fontSize: '16px' }} dangerouslySetInnerHTML={{ __html: preview.html }} />
              </>
            ) : (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '12px',
                  color: 'var(--on-surface-variant)',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 14 }} aria-hidden>
                  edit_note
                </span>
                We can&apos;t read this yet — keep typing your final answer.
              </span>
            )}
          </div>
        )}

        <span style={{ fontSize: '12px', color: 'var(--on-surface-variant)', letterSpacing: '0.01em' }}>
          Enter your final answer — <code>x = 5</code> or <code>5</code> both work.
        </span>

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

      {submittedExpression !== undefined && (
        <div
          style={{
            padding: '16px 18px',
            borderRadius: 'var(--radius-md)',
            background: correct
              ? 'rgb(var(--verdict-pass-rgb) / 0.08)'
              : 'rgb(var(--verdict-fail-rgb) / 0.08)',
            border: `1px solid ${
              correct ? 'rgb(var(--verdict-pass-rgb) / 0.3)' : 'rgb(var(--verdict-fail-rgb) / 0.3)'
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
              marginBottom: correct && !question.correctExplanation ? 0 : '6px',
              color: correct ? 'var(--success)' : 'var(--error)',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }} aria-hidden>
              {correct ? 'check_circle' : 'cancel'}
            </span>
            {correct ? 'Correct' : 'Not quite'}
          </div>
          {!correct && (
            <>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '8px',
                  fontSize: '14px',
                  color: 'var(--on-surface-variant)',
                  lineHeight: 1.6,
                  fontFamily: 'inherit',
                }}
              >
                Expected:{' '}
                {expectedHtml ? (
                  <span
                    style={{
                      fontSize: '15px',
                      color: 'var(--nm-primary-on-light)',
                      padding: '2px 8px',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--nm-primary-light)',
                    }}
                    dangerouslySetInnerHTML={{ __html: expectedHtml }}
                  />
                ) : (
                  <code
                    style={{
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                      color: 'var(--nm-primary-on-light)',
                      padding: '2px 6px',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--nm-primary-light)',
                    }}
                  >
                    {expectedExpression || '—'}
                  </code>
                )}
              </div>
              <div style={{ marginTop: '8px', fontSize: '13px', color: 'var(--on-surface-variant)', lineHeight: 1.6 }}>
                <MarkdownRenderer
                  content={
                    question.wrongExplanation ||
                    question.correctExplanation ||
                    'Equivalent expressions are accepted; the grader evaluates your answer numerically.'
                  }
                />
              </div>
            </>
          )}
          {correct && question.correctExplanation && (
            <div style={{ marginTop: '6px', fontSize: '13px', color: 'var(--on-surface-variant)', lineHeight: 1.6 }}>
              <MarkdownRenderer content={question.correctExplanation} />
            </div>
          )}
        </div>
      )}

      {mode === 'review' && submittedExpression === undefined && (
        <div
          style={{
            padding: '16px 18px',
            borderRadius: 'var(--radius-md)',
            marginBottom: '12px',
            background: 'var(--surface-container)',
            border: '1px solid var(--ink-08)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '6px',
              fontSize: '14px',
              color: 'var(--on-surface-variant)',
            }}
          >
            You skipped this question. Expected:{' '}
            {expectedHtml ? (
              <span
                style={{ fontSize: '15px', color: 'var(--success)' }}
                dangerouslySetInnerHTML={{ __html: expectedHtml }}
              />
            ) : (
              <strong style={{ color: 'var(--success)' }}>{expectedExpression || '—'}</strong>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function normalize(s: string): string {
  return s.replace(/\s+/g, '').toLowerCase();
}
