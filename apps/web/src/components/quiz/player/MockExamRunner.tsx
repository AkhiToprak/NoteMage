'use client';

/* Hallmark · component: mock exam runner · genre: editorial · theme: project (cream shell)
 * states: inherits QuizPlayerShell button states (hover · focus-visible · active · disabled);
 *         confirm dialog + grading overlay carry their own
 * contrast: pass (delegates chrome to QuizPlayerShell — semantic tokens only)
 * Hallmark · pre-emit critique: P5 H4 E4 S4 R4 V4
 *
 * Exam Mode Phase 3 — the timed mock-exam run surface. Reuses the QuizPlayerShell
 * + QuizViewer engine in the new `mock` mode (every answer staged, no verdict, free
 * navigation), and layers the four net-new mock features on top:
 *   1. a countdown TimerBar (auto-submits at zero),
 *   2. a question-navigator grid (answered / current / flagged / not-answered),
 *   3. a flag-for-review toggle per question,
 *   4. a single "Submit exam" that grades the whole set into one sealed attempt.
 * Grading runs through the canonical attempt route (QuizViewer.submitAll); this
 * component only links the attempt to the MockExam (the /complete call) and routes
 * to the results screen.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import QuizViewer from '@/components/notebook/QuizViewer';
import QuizPlayerShell from '@/components/quiz/player/QuizPlayerShell';
import { useOptionalMage } from '@/components/mage/MageProvider';
import { useRegisterMageContext } from '@/components/mage';
import { trackEvent } from '@/lib/telemetry';
import type { MageQuickAction, MissionStep, QuizSession, QuizSource } from '@/components/quiz/player/types';
import type { QuestionNavigatorItem } from '@/components/exam';

interface RunnerQuestion {
  id: string;
  kind: string;
  payload: unknown;
  question: string;
  options: string[];
  correctIndex: number;
  hint: string | null;
  correctExplanation: string | null;
  wrongExplanation: string | null;
  sourceLabel?: string | null;
  sourcePage?: number | null;
  sourceQuote?: string | null;
  sortOrder: number;
  image?: { id: string; caption: string | null } | null;
}

interface RunnerSet {
  id: string;
  title: string;
  questions: RunnerQuestion[];
}

interface MockExamRunnerProps {
  examId: string;
  mockId: string;
  notebookId: string;
  setId: string;
  /** Countdown length; 0 = untimed (no clock). */
  durationSec: number;
  /** Header title (the exam name). */
  title: string;
}

/** Date.now()-anchored countdown. Untimed when durationSec ≤ 0. Fires onExpire
 *  exactly once. Stops when `active` goes false (grading). */
function useMockCountdown(durationSec: number, active: boolean, onExpire: () => void): number {
  const [remaining, setRemaining] = useState(durationSec);
  const endRef = useRef<number | null>(null);
  const firedRef = useRef(false);
  const onExpireRef = useRef(onExpire);
  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    if (!active || durationSec <= 0) return;
    if (endRef.current == null) endRef.current = Date.now() + durationSec * 1000;
    const tick = () => {
      const end = endRef.current ?? Date.now();
      const rem = Math.max(0, Math.round((end - Date.now()) / 1000));
      setRemaining(rem);
      if (rem <= 0 && !firedRef.current) {
        firedRef.current = true;
        onExpireRef.current();
      }
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [active, durationSec]);

  return remaining;
}

function inferSourceKind(label?: string | null): QuizSource['kind'] {
  const l = (label ?? '').trim().toLowerCase();
  if (l.endsWith('.pdf')) return 'pdf';
  if (l.endsWith('.ppt') || l.endsWith('.pptx') || l.endsWith('.key')) return 'ppt';
  if (l.endsWith('.doc') || l.endsWith('.docx')) return 'doc';
  return 'page';
}

export default function MockExamRunner({
  examId,
  mockId,
  notebookId,
  setId,
  durationSec,
  title,
}: MockExamRunnerProps) {
  const router = useRouter();
  const mage = useOptionalMage();

  const [set, setSet] = useState<RunnerSet | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [session, setSession] = useState<QuizSession | null>(null);
  const [flags, setFlags] = useState<Set<number>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);

  const total = session?.total ?? set?.questions.length ?? 0;
  const answered = useMemo(() => new Set(session?.answeredIndices ?? []), [session?.answeredIndices]);

  const close = useCallback(() => {
    router.push(`/exam/${encodeURIComponent(examId)}`);
  }, [examId, router]);

  useEffect(() => {
    trackEvent('exam.mock.opened', { examId, mockId, durationSec });
  }, [examId, mockId, durationSec]);

  // Load the sealed set (same content endpoint as the practice runner).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/material/${encodeURIComponent(notebookId)}/quiz-sets/${encodeURIComponent(setId)}`,
        );
        const json = await res.json();
        if (cancelled) return;
        if (json?.success && json.data) setSet(json.data as RunnerSet);
        else setLoadError(json?.error ?? 'Could not load this mock exam.');
      } catch {
        if (!cancelled) setLoadError('Network error. Try again.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [notebookId, setId]);

  // Mage grounds on the exam context (sealed reveal gate — no answer leaks).
  useRegisterMageContext(
    set ? { type: 'exam', ids: { notebookId, quizSetId: setId, examId }, title } : null,
  );

  // Finalize: link the graded attempt to the mock + route to results. The
  // grading itself already happened (QuizViewer.submitAll → canonical attempt).
  const finalize = useCallback(
    async (attemptId: string) => {
      try {
        const res = await fetch(
          `/api/user/exams/${encodeURIComponent(examId)}/mock/${encodeURIComponent(mockId)}/complete`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ attemptId }),
          },
        );
        const json = (await res.json().catch(() => null)) as
          | { success?: boolean; data?: { resultUrl?: string }; error?: string }
          | null;
        const resultUrl =
          json?.data?.resultUrl ?? `/exam/${encodeURIComponent(examId)}/mock/${encodeURIComponent(mockId)}/results`;
        if (res.ok && json?.success) {
          router.push(resultUrl);
          return;
        }
        // The attempt is saved + graded regardless; the results screen reads it.
        router.push(resultUrl);
      } catch {
        setCompleteError('Saved your answers, but the results page didn’t open. Tap to view.');
        setSubmitting(false);
      }
    },
    [examId, mockId, router],
  );

  const handleComplete = useCallback(
    (result: { attemptId: string }) => {
      void finalize(result.attemptId);
    },
    [finalize],
  );

  const doSubmit = useCallback(() => {
    if (submitting) return;
    setConfirmOpen(false);
    setSubmitting(true);
    trackEvent('exam.mock.submitted', { examId, mockId, answered: answered.size, total });
    session?.submitAll?.();
  }, [submitting, session, examId, mockId, answered.size, total]);

  // Manual submit → confirm only when something's unanswered. Time-up auto-submits.
  const requestSubmit = useCallback(() => {
    if (submitting || !session) return;
    if (answered.size < total) setConfirmOpen(true);
    else doSubmit();
  }, [submitting, session, answered.size, total, doSubmit]);

  const onTimeUp = useCallback(() => {
    if (!submitting) doSubmit();
  }, [submitting, doSubmit]);

  const remainingSec = useMockCountdown(durationSec, !!set && !submitting, onTimeUp);

  const toggleFlag = useCallback(() => {
    const idx = session?.index ?? 0;
    setFlags((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, [session?.index]);

  const navigatorItems = useMemo<QuestionNavigatorItem[]>(() => {
    const current = session?.index ?? 0;
    return Array.from({ length: total }, (_, i) => ({
      index: i,
      state: i === current ? 'current' : answered.has(i) ? 'answered' : 'unanswered',
      flagged: flags.has(i),
    }));
  }, [total, session?.index, answered, flags]);

  const openMage = useCallback(() => {
    mage?.open({
      type: 'exam',
      ids: { notebookId, quizSetId: setId, examId },
      title,
      activeQuestionId: session?.questionId ?? undefined,
    });
  }, [mage, notebookId, setId, examId, title, session?.questionId]);

  const mageActions = useMemo<MageQuickAction[]>(
    () => [
      { label: 'Clarify the question', onClick: openMage },
      { label: 'Explain the concept', onClick: openMage },
    ],
    [openMage],
  );

  // Sources from the current question's provenance (Phase D/E), else the set.
  const questionSource = useMemo<QuizSource | undefined>(() => {
    const q = session && set ? set.questions[session.index] : undefined;
    if (!q || !q.sourceQuote) return undefined;
    return {
      id: `q-${q.id}`,
      title: q.sourceLabel?.trim() || title,
      kind: inferSourceKind(q.sourceLabel),
      detail: q.sourcePage != null ? `Page ${q.sourcePage}` : undefined,
      quote: q.sourceQuote,
    };
  }, [session, set, title]);

  const sources = useMemo<QuizSource[]>(() => {
    if (questionSource) return [questionSource];
    return set ? [{ id: set.id, title, kind: 'quiz', detail: 'Mock exam' }] : [];
  }, [questionSource, set, title]);

  const mission = useMemo<MissionStep[]>(
    () => [
      { id: 'mock', label: 'Mock exam', status: 'current' },
      { id: 'results', label: 'Results', status: 'finish' },
    ],
    [],
  );

  const flagged = flags.has(session?.index ?? -1);

  return (
    <>
      <QuizPlayerShell
        breadcrumb={['Mock exam', title]}
        title={title}
        stepLabel="Timed mock"
        session={session}
        graded
        sources={sources}
        questionSource={questionSource}
        mission={mission}
        mageSubtitle="Clarify only — answers stay sealed"
        mageActions={mageActions}
        mock={{
          timer: durationSec > 0 ? { remainingSec, totalSec: durationSec, paused: submitting } : null,
          navigatorItems,
          onJump: (i) => session?.jumpTo?.(i),
          flagged,
          onToggleFlag: toggleFlag,
          answeredCount: answered.size,
          onSubmitAll: requestSubmit,
          submitting,
        }}
        onAskMage={openMage}
        onShowSource={openMage}
        onClose={close}
        bodyOnly={!!loadError || !set}
      >
        {loadError ? (
          <p role="alert" style={{ color: 'var(--error)', fontSize: '14px' }}>
            {loadError}
          </p>
        ) : !set ? (
          <p style={{ color: 'var(--on-surface-variant)', fontSize: '14px' }}>Loading mock exam…</p>
        ) : (
          <QuizViewer
            notebookId={notebookId}
            setId={setId}
            title={set.title}
            initialQuestions={set.questions as never}
            isCheckpoint
            hideManagementActions
            externalChrome
            mock
            onSession={setSession}
            onComplete={(result) => handleComplete(result)}
          />
        )}
      </QuizPlayerShell>

      {confirmOpen ? (
        <ConfirmSubmit
          answered={answered.size}
          total={total}
          onConfirm={doSubmit}
          onCancel={() => setConfirmOpen(false)}
        />
      ) : null}

      {submitting ? <GradingOverlay error={completeError} mockId={mockId} examId={examId} /> : null}
    </>
  );
}

/** "Submit with unanswered questions?" confirm. Rides above the shell (z 1360). */
function ConfirmSubmit({
  answered,
  total,
  onConfirm,
  onCancel,
}: {
  answered: number;
  total: number;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const unanswered = Math.max(0, total - answered);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Submit mock exam"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1360,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        background: 'rgba(20, 16, 12, 0.45)',
      }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '420px',
          background: 'var(--quiz-card)',
          borderRadius: 'var(--radius-xl, 20px)',
          border: '1px solid var(--quiz-card-border)',
          padding: '24px',
          boxShadow: '0 24px 60px rgba(20,16,12,0.28)',
        }}
      >
        <h2 style={{ margin: '0 0 8px', fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 800, color: 'var(--on-surface)' }}>
          Submit your mock exam?
        </h2>
        <p style={{ margin: '0 0 20px', fontSize: '14px', lineHeight: 1.6, color: 'var(--on-surface-variant)' }}>
          {unanswered > 0
            ? `You’ve answered ${answered} of ${total}. The ${unanswered} unanswered ${unanswered === 1 ? 'question' : 'questions'} will be marked wrong.`
            : `You’ve answered all ${total} questions. Ready to grade?`}
        </p>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={onCancel}
            className="qs-btn qs-secondary"
            style={{
              padding: '10px 18px',
              borderRadius: 'var(--radius-full)',
              border: '1px solid var(--quiz-card-border)',
              background: 'transparent',
              color: 'var(--on-surface)',
              fontSize: '14px',
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Keep going
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="qs-btn qs-cta"
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
            Submit now
          </button>
        </div>
      </div>
    </div>
  );
}

/** Covers the shell while the attempt grades + the results page loads. */
function GradingOverlay({ error, mockId, examId }: { error: string | null; mockId: string; examId: string }) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1370,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '16px',
        padding: '24px',
        textAlign: 'center',
        background: 'var(--quiz-bg)',
      }}
    >
      {error ? (
        <>
          <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 40, color: 'var(--on-surface-variant)' }}>
            error
          </span>
          <p style={{ margin: 0, fontSize: '15px', color: 'var(--on-surface)', maxWidth: 360 }}>{error}</p>
          <a
            href={`/exam/${encodeURIComponent(examId)}/mock/${encodeURIComponent(mockId)}/results`}
            className="qs-btn qs-cta"
            style={{
              padding: '12px 26px',
              borderRadius: 'var(--radius-full)',
              background: 'var(--accent-strong)',
              color: 'var(--on-primary-container)',
              fontWeight: 800,
              fontSize: '15px',
              textDecoration: 'none',
            }}
          >
            View results
          </a>
        </>
      ) : (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/mascot/holding-wand-v2.png" alt="" style={{ width: 72, height: 72, opacity: 0.9 }} />
          <p style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--on-surface)' }}>Grading your mock exam…</p>
          <p style={{ margin: 0, fontSize: '13px', color: 'var(--on-surface-variant)' }}>Tallying your score and weak spots.</p>
        </>
      )}
    </div>
  );
}
