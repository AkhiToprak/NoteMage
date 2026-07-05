'use client';

/* Hallmark · component: remediation runner body · genre: editorial · theme: project (cream / --quiz-* + --nm-* tokens)
 * states: option buttons + CTA — hover · focus-visible · active · disabled
 * contrast: pass (semantic tokens only — theme-flipping cream↔navy, no inline hex)
 * Hallmark · pre-emit critique: P5 H4 E4 S4 R5 V4
 *
 * Weakness Training Phase 1B (plan §6.4) — plays a generated remediation
 * QuizSet's interleaved re-teach → discriminate → graded re-test rows inside
 * the shared cream QuizPlayerShell, WITHOUT touching QuizViewer (which is
 * built around "every row is a graded question" and can't express an
 * ungraded teaching step). Re-test rows dispatch through the same RENDERERS
 * registry + pure grade() QuizViewer uses, and the final POST goes through
 * the canonical attempts route so concept-tracking (Phase 1A) sees the
 * re-test performance. Teaching rows (reteach/discriminate) are local-only —
 * never submitted, never counted in the score denominator (the attempts
 * route already excludes payload.stepType rows from `total`).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import MarkdownRenderer from '@/components/ui/MarkdownRenderer';
import { RENDERERS } from '@/components/quiz/questionRenderers';
import type { UserAnswer } from '@/components/quiz/questionRenderers/types';
import { grade } from '@/lib/quiz-grading';
import { buildQuizActivityContext, type QuizActivityQuestion, type QuizActivityState } from '@/lib/mage-types';
import { trackEvent } from '@/lib/telemetry';
import GradedResultPanel, { type GradedResultAction } from './GradedResultPanel';
import type { QuizSession } from './types';
import type { QuestionKind } from '@notemage/shared';

export interface RunnerQuestion {
  id: string;
  kind: string;
  payload: unknown;
  question: string;
  options: string[];
  correctIndex: number;
  hint: string | null;
  correctExplanation: string | null;
  wrongExplanation: string | null;
  sortOrder: number;
}

interface ReteachPayload {
  stepType: 'reteach';
  conceptId?: string;
  hintEligible?: boolean;
  immediateFeedback?: boolean;
  reteach: { explanation: string; workedExample: string; sourceAnchor?: string };
}

interface DiscriminatePayload {
  stepType: 'discriminate';
  conceptId?: string;
  hintEligible?: boolean;
  immediateFeedback?: boolean;
  discriminate: {
    prompt: string;
    correctOption: string;
    confusedOption: string;
    explanation: string;
  };
}

function stepTypeOf(payload: unknown): 'reteach' | 'discriminate' | null {
  if (!payload || typeof payload !== 'object') return null;
  const st = (payload as { stepType?: unknown }).stepType;
  return st === 'reteach' || st === 'discriminate' ? st : null;
}

interface RemediationBodyProps {
  notebookId: string;
  setId: string;
  questions: RunnerQuestion[];
  onSession?: (s: QuizSession | null) => void;
  onExit: () => void;
}

export default function RemediationBody({
  notebookId,
  setId,
  questions,
  onSession,
  onExit,
}: RemediationBodyProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [discriminatePick, setDiscriminatePick] = useState<string | null>(null);
  const [stagedAnswer, setStagedAnswer] = useState<UserAnswer | undefined>(undefined);
  const [testAnswered, setTestAnswered] = useState(false);
  const [testCorrect, setTestCorrect] = useState<boolean | null>(null);
  const [confidence, setConfidence] = useState<'sure' | 'unsure' | null>(null);
  const [collected, setCollected] = useState<{ questionId: string; userAnswer: UserAnswer }[]>([]);
  const [phase, setPhase] = useState<'run' | 'submitting' | 'done' | 'error'>('run');
  const [result, setResult] = useState<{ score: number; total: number; percentage: number } | null>(
    null,
  );
  const [startTime] = useState(() => Date.now());

  const total = questions.length;
  const current = questions[stepIndex];
  const stepType = current ? stepTypeOf(current.payload) : null;
  const isLastStep = stepIndex === total - 1;

  // Stable non-obvious ordering for the two discriminate options — alternate
  // by step index rather than always leading with the correct one.
  const discriminateOrder = useMemo(() => {
    if (!current || stepType !== 'discriminate') return null;
    const p = (current.payload as DiscriminatePayload).discriminate;
    const options = [p.correctOption, p.confusedOption];
    return stepIndex % 2 === 0 ? options : [options[1], options[0]];
  }, [current, stepType, stepIndex]);

  const resetStepState = useCallback(() => {
    setDiscriminatePick(null);
    setStagedAnswer(undefined);
    setTestAnswered(false);
    setTestCorrect(null);
    setConfidence(null);
  }, []);

  const submitCollected = useCallback(
    async (answers: { questionId: string; userAnswer: UserAnswer }[]) => {
      setPhase('submitting');
      try {
        const timeSpent = Math.round((Date.now() - startTime) / 1000);
        const res = await fetch(
          `/api/material/${encodeURIComponent(notebookId)}/quiz-sets/${encodeURIComponent(setId)}/attempts`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ answers, timeSpent }),
          },
        );
        const json = await res.json();
        if (json?.success && json.data) {
          setResult({
            score: json.data.score,
            total: json.data.total,
            percentage: json.data.percentage,
          });
          trackEvent('quiz.session.opened', {
            context: 'remediation-complete',
            notebookId,
            setId,
          });
          setPhase('done');
        } else {
          setPhase('error');
        }
      } catch {
        setPhase('error');
      }
    },
    [notebookId, setId, startTime],
  );

  const advance = useCallback(() => {
    if (isLastStep) {
      void submitCollected(collected);
      return;
    }
    resetStepState();
    setStepIndex((i) => i + 1);
  }, [isLastStep, collected, submitCollected, resetStepState]);

  const advanceWithTestAnswer = useCallback(
    (entry: { questionId: string; userAnswer: UserAnswer }) => {
      const next = [...collected, entry];
      setCollected(next);
      if (isLastStep) {
        void submitCollected(next);
        return;
      }
      resetStepState();
      setStepIndex((i) => i + 1);
    },
    [collected, isLastStep, submitCollected, resetStepState],
  );

  const handleCheckAnswer = useCallback(() => {
    if (!current || testAnswered || !stagedAnswer) return;
    const kind = (current.kind ?? 'mc') as QuestionKind;
    const { isCorrect } = grade(
      kind,
      current.payload,
      { options: current.options, correctIndex: current.correctIndex },
      stagedAnswer,
    );
    setTestCorrect(isCorrect);
    setTestAnswered(true);
  }, [current, testAnswered, stagedAnswer]);

  const handleTestContinue = useCallback(() => {
    if (!current) return;
    if (!stagedAnswer) return;
    advanceWithTestAnswer({ questionId: current.id, userAnswer: stagedAnswer });
  }, [current, stagedAnswer, advanceWithTestAnswer]);

  const retryPost = useCallback(() => {
    void submitCollected(collected);
  }, [collected, submitCollected]);

  // Serialize the on-screen activity for Mage — ONLY the graded re-test rows
  // (stepType === null). Teaching steps (reteach/discriminate) stay ungrounded
  // here; Mage still has the notebook material for those. Revealing composes
  // once the re-test is graded (surface !== 'mock-exam'), which is what we want.
  const { activityContext, activityRevealing } = useMemo(() => {
    if (!current || stepType !== null) {
      return { activityContext: undefined, activityRevealing: undefined };
    }
    const activityQuestion: QuizActivityQuestion = {
      id: current.id,
      kind: (current.kind ?? 'mc') as QuizActivityQuestion['kind'],
      payload: current.payload,
      question: current.question,
      options: current.options,
      correctIndex: current.correctIndex,
      hint: current.hint,
      correctExplanation: current.correctExplanation,
      wrongExplanation: current.wrongExplanation,
    };
    const state: QuizActivityState = {
      surface: 'remediation',
      isSubmittedOrRevealed: testAnswered,
      answer: stagedAnswer,
      isCorrect: testCorrect ?? undefined,
      hintShown: false,
    };
    const built = buildQuizActivityContext(activityQuestion, state);
    return { activityContext: built.safe, activityRevealing: built.revealing };
  }, [current, stepType, testAnswered, stagedAnswer, testCorrect]);

  // Report a session shape up so the shell header progress + CTA can drive
  // this flow like any other quiz run. The shell's ctaFor() reads
  // isAnswered/canSubmit/isLast — teaching steps report isAnswered=true so
  // the shell renders "Continue" (submit is a no-op there); the discriminate
  // step becomes answered only once a pick is made; the graded step follows
  // the real two-step Check→Continue flow via canSubmit/isAnswered.
  // Empty set / submitting / error / done all report `mode: 'results'` so the
  // shell drops into its bare "plain" body (no QuestionCard, no sidebar, no
  // action bar) — the same signal QuizViewer sends for its own results screen.
  const session: QuizSession | null = useMemo(() => {
    if (total === 0 || phase !== 'run') {
      return {
        index: 0,
        total,
        mode: 'results',
        questionId: null,
        questionKind: null,
        isAnswered: false,
        isCorrect: null,
        isLast: true,
        canSubmit: false,
        submit: () => {},
        next: () => {},
        prev: () => {},
        retry: () => {},
        finish: () => {},
      };
    }
    if (!current) return null;
    const isAnswered =
      stepType === 'reteach'
        ? true
        : stepType === 'discriminate'
          ? discriminatePick !== null
          : testAnswered;
    const canSubmit = stepType === null ? stagedAnswer !== undefined && !testAnswered : false;
    const submit = stepType === null ? handleCheckAnswer : advance;
    const next = stepType === null ? handleTestContinue : advance;
    return {
      index: stepIndex,
      total,
      mode: 'quiz',
      questionId: current.id,
      questionKind: (current.kind ?? 'mc') as QuestionKind,
      isAnswered,
      isCorrect: stepType === null ? testCorrect : null,
      // Only the graded re-test row carries serializer context; the memo above
      // returns undefined for teaching steps (§ pedagogy boundary).
      activityContext,
      activityRevealing,
      isSubmittedOrRevealed: stepType === null ? testAnswered : false,
      isLast: isLastStep,
      canSubmit,
      submit,
      next,
      prev: () => {},
      retry: next,
      // `finish` (the shell's "Finish" CTA on the last step) MUST commit the
      // just-checked re-test answer, not the stale `collected` array. Every
      // remediation session ends on a re-test row (§6.4 order), so binding
      // finish to `advance` (which submits `collected` WITHOUT the current
      // answer) silently dropped the final concept's re-test from the POST —
      // deflating the score and breaking that concept's mastery/graduation
      // update. `next` (→ handleTestContinue on a re-test step) appends the
      // staged answer, then submits because it is the last step.
      finish: next,
    };
  }, [
    current,
    phase,
    stepType,
    discriminatePick,
    testAnswered,
    stagedAnswer,
    stepIndex,
    total,
    isLastStep,
    testCorrect,
    activityContext,
    activityRevealing,
    handleCheckAnswer,
    handleTestContinue,
    advance,
  ]);

  useEffect(() => {
    onSession?.(session);
  }, [session, onSession]);

  useEffect(() => {
    return () => onSession?.(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (total === 0) {
    return (
      <div style={{ padding: '32px 8px', textAlign: 'center' }}>
        <p style={{ margin: 0, fontSize: '14px', color: 'var(--on-surface-variant)' }}>
          Nothing to review here yet.
        </p>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div style={{ padding: '24px 8px', display: 'flex', flexDirection: 'column', gap: '14px', alignItems: 'center' }}>
        <p role="alert" style={{ margin: 0, fontSize: '14px', color: 'var(--error)', textAlign: 'center' }}>
          Couldn&apos;t save your results. Try again.
        </p>
        <RetryButton onClick={retryPost} />
      </div>
    );
  }

  if (phase === 'submitting') {
    return (
      <div style={{ padding: '32px 8px', textAlign: 'center' }}>
        <p style={{ margin: 0, fontSize: '14px', color: 'var(--on-surface-variant)' }}>Saving…</p>
      </div>
    );
  }

  if (phase === 'done' && result) {
    const passed = result.percentage >= 70;
    const actions: GradedResultAction[] = [{ label: 'Back to weak spots', onClick: onExit, icon: 'arrow_back' }];
    return (
      <GradedResultPanel
        hero={`${Math.round(result.percentage)}%`}
        heroSub={`${result.score} / ${result.total} correct`}
        tone={passed ? 'pass' : 'neutral'}
        title="Nice work"
        message={
          passed
            ? 'That concept is looking solid now. Keep an eye on it in your next practice.'
            : 'Progress, not perfection — this concept will come back around for more practice.'
        }
        ariaScore={`${Math.round(result.percentage)} percent, ${result.score} of ${result.total} correct`}
        actions={actions}
      />
    );
  }

  if (!current) return null;

  if (stepType === 'reteach') {
    const p = (current.payload as ReteachPayload).reteach;
    return (
      <div style={{ width: '100%' }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '5px 12px',
            borderRadius: 'var(--radius-full)',
            background: 'var(--nm-primary-light)',
            color: 'var(--nm-primary-on-light)',
            fontSize: '12px',
            fontWeight: 700,
            marginBottom: '14px',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 15 }} aria-hidden>
            auto_stories
          </span>
          Re-teach
        </div>
        <h2
          style={{
            margin: '0 0 14px',
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(20px, 2.2vw, 26px)',
            fontWeight: 800,
            letterSpacing: '-0.01em',
            lineHeight: 1.25,
            color: 'var(--on-surface)',
          }}
        >
          {current.question}
        </h2>
        <div
          style={{
            fontSize: '15px',
            lineHeight: 1.7,
            color: 'var(--on-surface)',
            marginBottom: '18px',
          }}
        >
          <MarkdownRenderer content={p.explanation} />
        </div>
        <div
          style={{
            padding: '16px 18px',
            borderRadius: 'var(--radius-md)',
            background: 'var(--surface-container-lowest)',
            border: '1px solid var(--outline-variant)',
          }}
        >
          <div
            style={{
              fontSize: '12px',
              fontWeight: 800,
              letterSpacing: '0.02em',
              textTransform: 'uppercase',
              color: 'var(--on-surface-variant)',
              marginBottom: '8px',
            }}
          >
            Worked example
          </div>
          <div style={{ fontSize: '14px', lineHeight: 1.65, color: 'var(--on-surface)' }}>
            <MarkdownRenderer content={p.workedExample} />
          </div>
        </div>
        {p.sourceAnchor ? (
          <p style={{ margin: '14px 0 0', fontSize: '12px', color: 'var(--on-surface-variant)' }}>
            From: {p.sourceAnchor}
          </p>
        ) : null}
      </div>
    );
  }

  if (stepType === 'discriminate') {
    const p = (current.payload as DiscriminatePayload).discriminate;
    const options = discriminateOrder ?? [p.correctOption, p.confusedOption];
    const picked = discriminatePick !== null;
    return (
      <div style={{ width: '100%' }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '5px 12px',
            borderRadius: 'var(--radius-full)',
            background: 'var(--nm-primary-light)',
            color: 'var(--nm-primary-on-light)',
            fontSize: '12px',
            fontWeight: 700,
            marginBottom: '14px',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 15 }} aria-hidden>
            compare_arrows
          </span>
          Quick check
        </div>
        <h2
          style={{
            margin: '0 0 18px',
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(20px, 2.2vw, 26px)',
            fontWeight: 800,
            letterSpacing: '-0.01em',
            lineHeight: 1.25,
            color: 'var(--on-surface)',
          }}
        >
          <MarkdownRenderer content={p.prompt} />
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '14px' }}>
          {options.map((opt) => {
            const isThisCorrect = opt === p.correctOption;
            const isThisPicked = discriminatePick === opt;
            let bg = 'var(--surface-container-lowest)';
            let borderColor = 'var(--outline-variant)';
            if (picked && isThisCorrect) {
              bg = 'rgb(var(--verdict-pass-rgb) / 0.08)';
              borderColor = 'rgb(var(--verdict-pass-rgb) / 0.55)';
            } else if (picked && isThisPicked && !isThisCorrect) {
              bg = 'rgb(var(--verdict-fail-rgb) / 0.08)';
              borderColor = 'rgb(var(--verdict-fail-rgb) / 0.55)';
            } else if (!picked && isThisPicked) {
              bg = 'var(--nm-primary-light)';
              borderColor = 'var(--nm-primary)';
            }
            return (
              <button
                key={opt}
                type="button"
                className="qmc-opt-static"
                onClick={() => !picked && setDiscriminatePick(opt)}
                disabled={picked}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '15px 18px',
                  minHeight: '56px',
                  borderRadius: 'var(--radius-md)',
                  border: `1.5px solid ${borderColor}`,
                  background: bg,
                  cursor: picked ? 'default' : 'pointer',
                  textAlign: 'left',
                  fontFamily: 'inherit',
                  width: '100%',
                  transition: 'border-color 0.18s var(--ease-spring), background-color 0.18s var(--ease-spring), transform 0.18s var(--ease-spring)',
                }}
                onMouseDown={(e) => {
                  if (!picked) e.currentTarget.style.transform = 'translateY(1px)';
                }}
                onMouseUp={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <span style={{ fontSize: '16px', color: 'var(--on-surface)', flex: 1, lineHeight: 1.5 }}>
                  <MarkdownRenderer content={opt} />
                </span>
                {picked && isThisCorrect ? (
                  <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--success)' }} aria-hidden>
                    check_circle
                  </span>
                ) : null}
                {picked && isThisPicked && !isThisCorrect ? (
                  <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--error)' }} aria-hidden>
                    cancel
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
        {picked ? (
          <div
            style={{
              padding: '16px 18px',
              borderRadius: 'var(--radius-md)',
              background:
                discriminatePick === p.correctOption
                  ? 'rgb(var(--verdict-pass-rgb) / 0.08)'
                  : 'rgb(var(--verdict-fail-rgb) / 0.08)',
              border: `1px solid ${
                discriminatePick === p.correctOption
                  ? 'rgb(var(--verdict-pass-rgb) / 0.3)'
                  : 'rgb(var(--verdict-fail-rgb) / 0.3)'
              }`,
              marginBottom: '4px',
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
                color: discriminatePick === p.correctOption ? 'var(--success)' : 'var(--error)',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }} aria-hidden>
                {discriminatePick === p.correctOption ? 'check_circle' : 'cancel'}
              </span>
              {discriminatePick === p.correctOption ? 'That’s the distinction' : 'Not quite the distinction'}
            </div>
            <div style={{ fontSize: '14px', color: 'var(--on-surface-variant)', lineHeight: 1.6 }}>
              <MarkdownRenderer content={p.explanation} />
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  // Graded re-test row — dispatch through the shared renderer registry.
  const kind = (current.kind ?? 'mc') as QuestionKind;
  const Renderer = RENDERERS[kind];

  return (
    <div style={{ width: '100%' }}>
      {!Renderer ? (
        <div
          style={{
            padding: '16px 20px',
            borderRadius: '12px',
            border: '1px solid rgb(var(--verdict-fail-rgb) / 0.3)',
            background: 'rgb(var(--verdict-fail-rgb) / 0.06)',
            color: 'var(--error)',
            fontSize: '13px',
            lineHeight: 1.6,
            marginBottom: '16px',
          }}
        >
          This question uses a type ({kind}) that isn&apos;t supported in this version yet.
        </div>
      ) : (
        <Renderer
          key={current.id}
          question={{
            id: current.id,
            kind,
            question: current.question,
            options: current.options,
            correctIndex: current.correctIndex,
            payload: current.payload as never,
            hint: null,
            correctExplanation: current.correctExplanation,
            wrongExplanation: current.wrongExplanation,
            sortOrder: current.sortOrder,
          }}
          mode="quiz"
          isAnswered={testAnswered}
          currentAnswer={stagedAnswer}
          reviewAnswer={undefined}
          gradedCorrect={testCorrect ?? undefined}
          showHint={false}
          onToggleHint={() => {}}
          onSelectAnswer={setStagedAnswer}
          isPhone={false}
          coarsePointer={false}
          externalChrome
        />
      )}

      {/* Confidence UI (plan §6.6) — internal signal only, re-test step only. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          marginTop: '4px',
          marginBottom: '16px',
        }}
      >
        <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--on-surface-variant)' }}>
          How sure are you?
        </span>
        <ConfidencePill
          label="Sure"
          active={confidence === 'sure'}
          onClick={() => setConfidence('sure')}
          disabled={testAnswered}
        />
        <ConfidencePill
          label="Not sure"
          active={confidence === 'unsure'}
          onClick={() => setConfidence('unsure')}
          disabled={testAnswered}
        />
      </div>
    </div>
  );
}

function ConfidencePill({
  label,
  active,
  onClick,
  disabled,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className="rem-conf-pill"
      style={{
        padding: '6px 14px',
        borderRadius: 'var(--radius-full)',
        border: `1px solid ${active ? 'var(--nm-primary)' : 'var(--quiz-card-border)'}`,
        background: active ? 'var(--nm-primary-light)' : 'transparent',
        color: active ? 'var(--nm-primary-on-light)' : 'var(--on-surface-variant)',
        fontSize: '12px',
        fontWeight: 700,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled && !active ? 0.5 : 1,
        fontFamily: 'inherit',
        transition: 'border-color 0.15s var(--ease-spring), background-color 0.15s var(--ease-spring)',
      }}
    >
      {label}
    </button>
  );
}

function RetryButton({ onClick }: { onClick: () => void }) {
  return (
    <>
      <style>{`
        .rem-cta { transition: filter 0.15s var(--ease-spring), transform 0.15s var(--ease-spring); }
        .rem-cta:not(:disabled):hover { filter: brightness(1.06); }
        .rem-cta:not(:disabled):active { transform: translateY(1px); }
        .rem-cta:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 2px; }
        @media (prefers-reduced-motion: reduce) {
          .rem-cta { transition: none; }
          .rem-cta:not(:disabled):active { transform: none; }
        }
      `}</style>
    <button
      type="button"
      onClick={onClick}
      className="rem-cta"
      style={{
        padding: '10px 22px',
        borderRadius: 'var(--radius-full)',
        border: 'none',
        background: 'var(--accent-strong)',
        color: 'var(--on-primary-container)',
        fontSize: '14px',
        fontWeight: 800,
        cursor: 'pointer',
        fontFamily: 'inherit',
      }}
    >
      Try again
    </button>
    </>
  );
}
