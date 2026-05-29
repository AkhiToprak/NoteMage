'use client';

import { useEffect, useMemo, useState } from 'react';
import MarkdownRenderer from '@/components/ui/MarkdownRenderer';
import CodeMirrorEditor from '@/components/quiz/CodeMirrorEditor';
import type { CodeWritePayload, ExecutableCodeLanguage } from '@notemage/shared';
import type { QuestionProps } from './types';

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
        // Commit the verdict as the answer.
        onSelectAnswer({
          kind: 'code_write',
          language: payload.language,
          code,
          passed: data.data.allPassed,
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

  return (
    <div
      style={{
        width: '100%',
        maxWidth: isPhone ? '100%' : '640px',
        marginBottom: '20px',
      }}
    >
      <div
        style={{
          background: 'var(--quiz-question-surface)',
          border: '1px solid rgba(174,137,255,0.38)',
          borderRadius: '16px',
          padding: isPhone ? '20px 16px' : '24px 22px',
          marginBottom: '12px',
          boxShadow: '0 2px 14px rgba(0,0,0,0.55), inset 0 1px 0 rgba(196,169,255,0.10)',
        }}
      >
        <div style={{ fontSize: '18px', color: '#f5f1ff', lineHeight: 1.6 }}>
          <MarkdownRenderer content={question.question} />
        </div>
        <div style={{ display: 'flex', marginTop: '12px' }}>
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
            {language}
          </span>
        </div>
      </div>

      <CodeMirrorEditor
        value={code}
        language={language}
        readOnly={inputDisabled}
        onChange={setCode}
        minHeight="200px"
        maxHeight="420px"
      />

      <div
        style={{
          display: 'flex',
          gap: '8px',
          marginTop: '12px',
          flexWrap: 'wrap',
        }}
      >
        {!inputDisabled && (
          <>
            <button
              onClick={onRun}
              disabled={code.trim().length === 0 || pendingMode !== null}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '10px 16px',
                borderRadius: '10px',
                border: '1px solid rgba(140,82,255,0.45)',
                background: 'transparent',
                color: '#c4a9ff',
                fontSize: '13px',
                fontWeight: 600,
                cursor:
                  code.trim().length === 0 || pendingMode !== null ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {pendingMode === 'run' ? (
                <span className="material-symbols-outlined cm-spin" style={{ fontSize: 14 }} aria-hidden>progress_activity</span>
              ) : (
                <span className="material-symbols-outlined" style={{ fontSize: 14 }} aria-hidden>play_arrow</span>
              )}
              Run
            </button>
            <button
              onClick={onSubmit}
              disabled={code.trim().length === 0 || pendingMode !== null}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '10px 16px',
                borderRadius: '10px',
                border: 'none',
                background: '#8c52ff',
                color: 'var(--on-surface)',
                fontSize: '13px',
                fontWeight: 600,
                cursor:
                  code.trim().length === 0 || pendingMode !== null ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                boxShadow: '0 4px 16px rgba(140,82,255,0.25)',
              }}
            >
              {pendingMode === 'grade' ? (
                <span className="material-symbols-outlined cm-spin" style={{ fontSize: 14 }} aria-hidden>progress_activity</span>
              ) : (
                <span className="material-symbols-outlined" style={{ fontSize: 14 }} aria-hidden>send</span>
              )}
              Submit
            </button>
          </>
        )}
        {question.hint && !isAnswered && mode === 'quiz' && (
          <button
            onClick={onToggleHint}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '10px 14px',
              borderRadius: '10px',
              border: '1px solid rgba(251,191,36,0.2)',
              background: showHint ? 'rgba(251,191,36,0.08)' : 'transparent',
              color: '#fbbf24',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 13 }} aria-hidden>lightbulb</span>
            {showHint ? 'Hide hint' : coarsePointer ? 'Show hint' : 'Show hint (H)'}
          </button>
        )}
      </div>

      <style>{`
        .cm-spin { animation: cmSpin 0.9s linear infinite; }
        @keyframes cmSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>

      {showHint && question.hint && (
        <div
          style={{
            marginTop: '12px',
            padding: '12px 16px',
            borderRadius: '10px',
            background: 'rgba(251,191,36,0.06)',
            border: '1px solid rgba(251,191,36,0.15)',
            fontSize: '13px',
            color: 'rgba(251,191,36,0.8)',
            lineHeight: 1.6,
          }}
        >
          {question.hint}
        </div>
      )}

      {error && (
        <div
          style={{
            marginTop: '12px',
            padding: '12px 16px',
            borderRadius: '10px',
            background: 'rgba(252,165,165,0.08)',
            border: '1px solid rgba(252,165,165,0.25)',
            fontSize: '13px',
            color: '#fca5a5',
          }}
        >
          {error}
        </div>
      )}

      {unavailable && (
        <p
          style={{
            marginTop: '8px',
            fontSize: '12px',
            color: 'rgba(237,233,255,0.5)',
            lineHeight: 1.5,
          }}
        >
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
            padding: '14px 18px',
            borderRadius: '12px',
            background: isCorrect ? 'rgba(74,222,128,0.06)' : 'rgba(252,165,165,0.06)',
            border: `1px solid ${isCorrect ? 'rgba(74,222,128,0.2)' : 'rgba(252,165,165,0.2)'}`,
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
                <span className="material-symbols-outlined" style={{ fontSize: 16 }} aria-hidden>check_circle</span> All tests passed
              </>
            ) : (
              <>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }} aria-hidden>cancel</span> Some tests failed
              </>
            )}
          </div>
          <div style={{ fontSize: '13px', color: 'rgba(237,233,255,0.7)', lineHeight: 1.6 }}>
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

function CaseResultRow({ index, result }: { index: number; result: RunResult }) {
  const label = result.name ?? `Test ${index + 1}`;
  const verdict = result.isCorrect;
  const statusColor =
    verdict === true ? '#4ade80' : verdict === false ? '#fca5a5' : '#c4a9ff';
  const bg =
    verdict === true
      ? 'rgba(74,222,128,0.06)'
      : verdict === false
        ? 'rgba(252,165,165,0.06)'
        : 'rgba(140,82,255,0.06)';
  const border =
    verdict === true
      ? 'rgba(74,222,128,0.22)'
      : verdict === false
        ? 'rgba(252,165,165,0.22)'
        : 'rgba(140,82,255,0.22)';
  return (
    <details
      style={{
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: '10px',
        padding: '8px 12px',
        fontFamily: '"JetBrains Mono", "Fira Code", monospace',
        fontSize: '12.5px',
        color: '#ede4ff',
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
          <span className="material-symbols-outlined" style={{ fontSize: 14 }} aria-hidden>check_circle</span>
        ) : verdict === false ? (
          <span className="material-symbols-outlined" style={{ fontSize: 14 }} aria-hidden>cancel</span>
        ) : (
          <span className="material-symbols-outlined" style={{ fontSize: 14 }} aria-hidden>play_arrow</span>
        )}
        {label}
        <span style={{ marginLeft: 'auto', color: 'rgba(237,233,255,0.5)' }}>
          {result.durationMs}ms
        </span>
      </summary>
      <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {result.stdin && (
          <RunBlock title="stdin" body={result.stdin} color="rgba(196,169,255,0.7)" />
        )}
        {result.expectedStdout !== undefined && (
          <RunBlock
            title="expected stdout"
            body={result.expectedStdout}
            color="rgba(74,222,128,0.8)"
          />
        )}
        <RunBlock title="actual stdout" body={result.stdout || '(empty)'} color="#ede4ff" />
        {result.stderr && (
          <RunBlock title="stderr" body={result.stderr} color="rgba(252,165,165,0.8)" />
        )}
      </div>
    </details>
  );
}

function RunBlock({
  title,
  body,
  color,
}: {
  title: string;
  body: string;
  color: string;
}) {
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
          borderRadius: '6px',
          background: 'rgba(0,0,0,0.35)',
          color: '#ede4ff',
          whiteSpace: 'pre-wrap',
          overflowX: 'auto',
        }}
      >
        {body}
      </pre>
    </div>
  );
}
