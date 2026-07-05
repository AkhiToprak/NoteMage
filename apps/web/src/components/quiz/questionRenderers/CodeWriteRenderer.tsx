'use client';

/* Hallmark · component: coding (code-write) quiz · genre: editorial · theme: project (cream / --nm-* + verdict tokens)
 * states: default · hover · focus-visible · running · disabled · passed · failed · error · unavailable
 * contrast: pass (uses --surface-* / --on-surface / --nm-* / --verdict-* tokens — theme-flipping, no inline hex)
 * Hallmark · pre-emit critique: P5 H5 E4 S5 R5 V4
 *
 * Figma redesign (Quiz screens · "Coding"): the REAL runner is kept — CodeMirror
 * editor, server execution, Terminal/test-result rows, pass/fail feedback (a genuine
 * runner, not decorative chrome). Body-only — the type badge, source chip and white
 * card come from QuestionCard. In the shell (externalChrome) the inline "Run code"
 * runs the graded tests and stages the verdict; the shell's ActionBar commits it.
 * The study-pack page keeps the inline Run + Submit buttons (immediate commit).
 */

import { useEffect, useMemo, useState } from 'react';
import MarkdownRenderer from '@/components/ui/MarkdownRenderer';
import CodeMirrorEditor from '@/components/quiz/CodeMirrorEditor';
import HintButton from './HintButton';
import type { CodeWritePayload, ExecutableCodeLanguage } from '@notemage/shared';
import type { QuestionProps, CodeWriteRun } from './types';

interface RunResult {
  name?: string;
  stdin?: string;
  expectedStdout?: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  ok: boolean;
  isCorrect?: boolean;
  durationMs: number;
}

interface CodeExecuteResponse {
  success: boolean;
  data?: { mode: 'run' | 'grade'; runs: RunResult[]; allPassed: boolean };
  error?: string;
}

export default function CodeWriteRenderer({
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
}: QuestionProps<CodeWritePayload | null>) {
  const payload = question.payload;

  // Live code state. Initial value is the AI-provided starter; once the
  // learner submits, we freeze the editor to the submitted code.
  const [code, setCode] = useState<string>(payload?.starterCode ?? '');
  const [runs, setRuns] = useState<RunResult[] | null>(null);
  const [pendingMode, setPendingMode] = useState<'run' | 'grade' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  // Display the submitted code + result when the answer is finalized.
  const submitted = useMemo(() => {
    if (mode === 'review' && reviewAnswer?.kind === 'code_write') {
      return reviewAnswer;
    }
    if (isAnswered && currentAnswer?.kind === 'code_write') {
      return currentAnswer;
    }
    return null;
  }, [mode, reviewAnswer, isAnswered, currentAnswer]);

  // Lock the editor to the submitted code once the learner has committed.
  useEffect(() => {
    if (submitted) setCode(submitted.code);
  }, [submitted]);

  const inputDisabled = isAnswered || mode === 'review' || pendingMode !== null;
  const language: ExecutableCodeLanguage = payload?.language ?? 'python';

  async function postExecute(includeTests: boolean) {
    if (!payload) return;
    setError(null);
    setPendingMode(includeTests ? 'grade' : 'run');
    try {
      const res = await fetch('/api/quiz/code-execute', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          language: payload.language,
          code,
          runTimeoutMs: payload.runTimeoutMs,
          ...(includeTests ? { tests: payload.tests } : {}),
        }),
      });
      if (res.status === 503) {
        setUnavailable(true);
        setError('Code execution is not configured on this server.');
        return;
      }
      const data = (await res.json()) as CodeExecuteResponse;
      if (!data.success || !data.data) {
        setError(data.error ?? 'Code execution failed.');
        return;
      }
      setRuns(data.data.runs);
      if (includeTests) {
        // Record the verdict as the answer. In the shell (externalChrome) this
        // STAGES it — the sticky ActionBar commits on "Submit answer"; on the
        // study-pack page it commits immediately (code_write is a final answer).
        onSelectAnswer({
          kind: 'code_write',
          language: payload.language,
          code,
          passed: data.data.allPassed,
          runs: compactRuns(data.data.runs),
        });
      }
    } catch {
      setError('Network error. Try again.');
    } finally {
      setPendingMode(null);
    }
  }

  const onRun = () => void postExecute(false);
  const onSubmit = () => void postExecute(true);

  const submittedRuns = submitted ? runs : null;
  const isCorrect = submitted?.passed === true;
  const runDisabled = code.trim().length === 0 || pendingMode !== null;

  return (
    <div style={{ width: '100%' }}>
      <style>{`
        .cm-spin { animation: cmSpin 0.9s linear infinite; }
        @keyframes cmSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .qcw-run:not(:disabled):hover { opacity: 0.92; }
        .qcw-run:not(:disabled):active { transform: translateY(1px); }
        .qcw-run:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 2px; }
        @media (prefers-reduced-motion: reduce) { .qcw-run:not(:disabled):active { transform: none; } }
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
          marginBottom: '6px',
        }}
      >
        <MarkdownRenderer content={question.question} />
      </div>
      <p style={{ margin: '0 0 16px', fontSize: '14px', lineHeight: 1.5, color: 'var(--on-surface-variant)' }}>
        Write your solution, then run it against the tests.
      </p>

      <CodeMirrorEditor
        value={code}
        language={language}
        readOnly={inputDisabled}
        onChange={setCode}
        minHeight="200px"
        maxHeight="420px"
      />

      <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        {!inputDisabled && externalChrome && (
          // Shell: one inline "Run code" runs the graded tests + stages the
          // verdict; the sticky ActionBar "Submit answer" commits it.
          <button
            onClick={onSubmit}
            disabled={runDisabled}
            className="qcw-run"
            style={runButtonStyle(coarsePointer, runDisabled)}
          >
            {pendingMode === 'grade' ? (
              <span className="material-symbols-outlined cm-spin" style={{ fontSize: 16 }} aria-hidden>progress_activity</span>
            ) : (
              <span className="material-symbols-outlined" style={{ fontSize: 16 }} aria-hidden>play_arrow</span>
            )}
            Run code
          </button>
        )}
        {!inputDisabled && !externalChrome && (
          <>
            <button
              onClick={onRun}
              disabled={runDisabled}
              className="qcw-run"
              style={{
                ...runButtonStyle(coarsePointer, runDisabled),
                background: 'var(--surface-container-lowest)',
                color: 'var(--on-surface)',
                border: '1.5px solid var(--outline-variant)',
              }}
            >
              {pendingMode === 'run' ? (
                <span className="material-symbols-outlined cm-spin" style={{ fontSize: 16 }} aria-hidden>progress_activity</span>
              ) : (
                <span className="material-symbols-outlined" style={{ fontSize: 16 }} aria-hidden>play_arrow</span>
              )}
              Run
            </button>
            <button
              onClick={onSubmit}
              disabled={runDisabled}
              className="qcw-run"
              style={{
                ...runButtonStyle(coarsePointer, runDisabled),
                background: 'var(--accent-strong)',
                color: 'var(--on-primary-container)',
                boxShadow: '0 4px 16px rgb(124 92 255 / 0.25)',
              }}
            >
              {pendingMode === 'grade' ? (
                <span className="material-symbols-outlined cm-spin" style={{ fontSize: 16 }} aria-hidden>progress_activity</span>
              ) : (
                <span className="material-symbols-outlined" style={{ fontSize: 16 }} aria-hidden>send</span>
              )}
              Submit
            </button>
          </>
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

      {error && (
        <div
          style={{
            marginTop: '12px',
            padding: '12px 16px',
            borderRadius: 'var(--radius-md)',
            background: 'rgb(var(--verdict-fail-rgb) / 0.08)',
            border: '1px solid rgb(var(--verdict-fail-rgb) / 0.3)',
            fontSize: '13px',
            color: 'var(--error)',
          }}
        >
          {error}
        </div>
      )}

      {unavailable && (
        <p style={{ marginTop: '8px', fontSize: '12px', color: 'var(--on-surface-variant)', lineHeight: 1.5 }}>
          The code runner isn&apos;t available right now. Skip this question or come back later.
        </p>
      )}

      {(runs || submittedRuns) && (runs ?? submittedRuns)!.length > 0 && (
        <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {(runs ?? submittedRuns)!.map((r, i) => (
            <CaseResultRow key={i} index={i} result={r} />
          ))}
        </div>
      )}

      {submitted && (
        <div
          style={{
            marginTop: '12px',
            padding: '16px 18px',
            borderRadius: 'var(--radius-md)',
            background: isCorrect
              ? 'rgb(var(--verdict-pass-rgb) / 0.08)'
              : 'rgb(var(--verdict-fail-rgb) / 0.08)',
            border: `1px solid ${
              isCorrect ? 'rgb(var(--verdict-pass-rgb) / 0.3)' : 'rgb(var(--verdict-fail-rgb) / 0.3)'
            }`,
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
            {isCorrect ? 'All tests passed' : 'Some tests failed'}
          </div>
          <div style={{ fontSize: '14px', color: 'var(--on-surface-variant)', lineHeight: 1.6 }}>
            <MarkdownRenderer
              content={
                isCorrect
                  ? question.correctExplanation ||
                    'Your program produced the expected output for every test case.'
                  : question.wrongExplanation ||
                    'Compare your output against the expected output in each failing case.'
              }
            />
          </div>
        </div>
      )}
    </div>
  );
}

// Compact the full RunResult[] into the small shape the Mage serializer needs.
// For a GRADED test, "passed" is whether the output matched expected
// (`isCorrect`), NOT whether it merely ran (`ok`) — the serializer prints
// PASS/FAIL from `ok`, so it must carry the test verdict. Caps keep the answer
// small while it lives in the in-memory answers Map (runs are stripped before
// the answer is POSTed, so this never hits the DB); the serializer caps again.
const FIELD_CAP = 400;
const MAX_RUNS = 12;
const capField = (s: string | undefined) =>
  s === undefined ? undefined : s.length > FIELD_CAP ? s.slice(0, FIELD_CAP) : s;

export function compactRuns(runs: RunResult[]): CodeWriteRun[] {
  return runs.slice(0, MAX_RUNS).map((r) => ({
    name: r.name,
    stdin: capField(r.stdin),
    expectedStdout: capField(r.expectedStdout),
    stdout: capField(r.stdout),
    stderr: capField(r.stderr),
    exitCode: r.exitCode,
    ok: r.isCorrect ?? r.ok,
  }));
}

function runButtonStyle(coarsePointer: boolean, disabled: boolean): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '7px',
    padding: '11px 18px',
    minHeight: coarsePointer ? '46px' : '42px',
    borderRadius: 'var(--radius-md)',
    border: 'none',
    background: 'var(--on-surface)',
    color: 'var(--surface)',
    fontSize: '14px',
    fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    fontFamily: 'inherit',
    transition: 'opacity 0.15s, transform 0.12s cubic-bezier(0.22,1,0.36,1)',
  };
}

function CaseResultRow({ index, result }: { index: number; result: RunResult }) {
  const label = result.name ?? `Test ${index + 1}`;
  const verdict = result.isCorrect;
  const statusColor =
    verdict === true ? 'var(--success)' : verdict === false ? 'var(--error)' : 'var(--nm-primary-on-light)';
  const bg =
    verdict === true
      ? 'rgb(var(--verdict-pass-rgb) / 0.08)'
      : verdict === false
        ? 'rgb(var(--verdict-fail-rgb) / 0.08)'
        : 'var(--nm-primary-light)';
  const border =
    verdict === true
      ? 'rgb(var(--verdict-pass-rgb) / 0.3)'
      : verdict === false
        ? 'rgb(var(--verdict-fail-rgb) / 0.3)'
        : 'var(--nm-primary)';
  return (
    // Auto-expand anything that isn't a clean pass — a failed test (verdict
    // false) or a practice run (verdict undefined) — so the learner sees the
    // actual vs expected output without hunting for a click target. Passing
    // tests stay collapsed.
    <details
      open={verdict !== true}
      style={{
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: 'var(--radius-md)',
        padding: '10px 14px',
        fontFamily: '"JetBrains Mono", "Fira Code", monospace',
        fontSize: '12.5px',
        color: 'var(--on-surface)',
      }}
    >
      <summary
        style={{
          listStyle: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontWeight: 700,
          color: statusColor,
          fontFamily: 'inherit',
        }}
      >
        {verdict === true ? (
          <span className="material-symbols-outlined" style={{ fontSize: 15 }} aria-hidden>check_circle</span>
        ) : verdict === false ? (
          <span className="material-symbols-outlined" style={{ fontSize: 15 }} aria-hidden>cancel</span>
        ) : (
          <span className="material-symbols-outlined" style={{ fontSize: 15 }} aria-hidden>play_arrow</span>
        )}
        {label}
        <span style={{ marginLeft: 'auto', color: 'var(--on-surface-variant)' }}>{result.durationMs}ms</span>
      </summary>
      <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {result.stdin && (
          <RunBlock title="stdin" body={result.stdin} color="var(--nm-primary-on-light)" />
        )}
        {result.expectedStdout !== undefined && (
          <RunBlock title="expected stdout" body={result.expectedStdout} color="var(--success)" />
        )}
        <RunBlock title="actual stdout" body={result.stdout || '(empty)'} color="var(--on-surface-variant)" />
        {result.stderr && <RunBlock title="stderr" body={result.stderr} color="var(--error)" />}
      </div>
    </details>
  );
}

function RunBlock({ title, body, color }: { title: string; body: string; color: string }) {
  return (
    <div>
      <div
        style={{
          fontSize: '10.5px',
          fontWeight: 700,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color,
          marginBottom: '2px',
        }}
      >
        {title}
      </div>
      <pre
        style={{
          margin: 0,
          padding: '6px 8px',
          borderRadius: 'var(--radius-sm)',
          background: 'var(--surface-container-highest)',
          color: 'var(--on-surface)',
          whiteSpace: 'pre-wrap',
          overflowX: 'auto',
        }}
      >
        {body}
      </pre>
    </div>
  );
}
