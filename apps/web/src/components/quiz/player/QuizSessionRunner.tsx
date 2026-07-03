'use client';

/* Hallmark · component: quiz session runner · genre: editorial · theme: project (cream shell)
 * states: inherits QuizPlayerShell button states (hover · focus-visible · active · disabled)
 * contrast: pass (delegates all chrome to QuizPlayerShell / GradedResultPanel — semantic tokens only)
 * Hallmark · pre-emit critique: P5 H4 E4 S4 R5 V4
 *
 * Phase E — the shared shell-based run surface for the two non-path contexts:
 *   • weakness PRACTICE — formative: per-question verdict + hints-first Mage.
 *   • mock EXAM       — sealed: answers submitted with NO verdict (forward-only),
 *                       Mage answers stay sealed, graded result at the end.
 * Both run a generated QuizSet that lives under the hidden "Practice with Mage"
 * notebook, loaded by id and played through the SAME QuizViewer engine + canonical
 * attempt route the path checkpoint uses (zero new grading code). Mirrors
 * CheckpointQuizViewer's shell wiring; the only behavioural fork is `sealed`.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import QuizViewer from '@/components/notebook/QuizViewer';
import QuizPlayerShell from '@/components/quiz/player/QuizPlayerShell';
import GradedResultPanel, { type GradedResultAction } from '@/components/quiz/player/GradedResultPanel';
import RemediationBody from '@/components/quiz/player/RemediationBody';
import { useOptionalMage } from '@/components/mage/MageProvider';
import { useRegisterMageContext } from '@/components/mage';
import { gradeForPercentage } from '@/lib/path-gating';
import { trackEvent } from '@/lib/telemetry';
import { buildQuizQuestionContext, type MageContextType } from '@/lib/mage-types';
import type { MageQuickAction, MissionStep, QuizSession, QuizSource } from '@/components/quiz/player/types';

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

interface ExamResult {
  percentage: number;
  stars: number;
}

export type RunnerContext = 'practice' | 'exam' | 'remediation';

interface QuizSessionRunnerProps {
  notebookId: string;
  setId: string;
  context: RunnerContext;
  /** Exam this run belongs to — grounds Mage + drives the "Back to exam" exit. */
  examId?: string;
  /** Header title; falls back to the loaded set title. */
  titleOverride?: string;
  /** Header pill, e.g. "Mock exam" / "Weak-spot practice". */
  stepLabel?: string;
  /** Crumbs root → leaf; defaults to a single context label. */
  breadcrumb?: string[];
}

/** Map a source label (usually a file name / section heading) to a Sources icon. */
function inferSourceKind(label?: string | null): QuizSource['kind'] {
  const l = (label ?? '').trim().toLowerCase();
  if (l.endsWith('.pdf')) return 'pdf';
  if (l.endsWith('.ppt') || l.endsWith('.pptx') || l.endsWith('.key')) return 'ppt';
  if (l.endsWith('.doc') || l.endsWith('.docx')) return 'doc';
  return 'page';
}

/** Exam stars from the final score — mirrors the checkpoint 70/80/90 ladder. */
function starsForPercentage(pct: number): number {
  if (pct >= 90) return 3;
  if (pct >= 80) return 2;
  if (pct >= 70) return 1;
  return 0;
}

export default function QuizSessionRunner({
  notebookId,
  setId,
  context,
  examId,
  titleOverride,
  stepLabel,
  breadcrumb,
}: QuizSessionRunnerProps) {
  const router = useRouter();
  const [set, setSet] = useState<RunnerSet | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [session, setSession] = useState<QuizSession | null>(null);
  const [examResult, setExamResult] = useState<ExamResult | null>(null);
  // Bumped on retake so QuizViewer remounts and its answer state resets.
  const [retakeCount, setRetakeCount] = useState(0);
  const mage = useOptionalMage();

  const isExam = context === 'exam';
  const isRemediation = context === 'remediation';
  const title =
    titleOverride || set?.title || (isExam ? 'Mock exam' : isRemediation ? 'Weak-spot training' : 'Practice');
  const mageType: MageContextType = isExam ? 'exam' : 'quiz-question';

  // Close target: back to the exam overview for a mock exam, back to Weak
  // Spots for remediation, else the paths home.
  const close = useCallback(() => {
    if (isRemediation) router.push('/profile/weak-spots');
    else if (examId) router.push(`/exam/${encodeURIComponent(examId)}`);
    else router.push('/my-path');
  }, [isRemediation, examId, router]);

  useEffect(() => {
    trackEvent('quiz.session.opened', { context, notebookId, setId, examId: examId ?? null });
  }, [context, notebookId, setId, examId]);

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
        else setLoadError(json?.error ?? 'Could not load this quiz.');
      } catch {
        if (!cancelled) setLoadError('Network error. Try again.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [notebookId, setId]);

  // Esc closes the run (but not while typing into a field).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [close]);

  // Register the surface so the floating Mage button grounds on it (exam → sealed
  // gate, practice → hints-first). Ids are re-authorized server-side.
  useRegisterMageContext(
    set
      ? { type: mageType, ids: { notebookId, quizSetId: setId, examId }, title }
      : null,
  );

  // Exam grades through the canonical attempt route → derive stars from the score
  // (there's no path slot to POST /assessment to). Practice is formative — it
  // shows QuizViewer's own results screen, so it sets no examResult.
  const handleComplete = useCallback(
    (result: { percentage: number }) => {
      if (!isExam) return;
      setExamResult({ percentage: result.percentage, stars: starsForPercentage(result.percentage) });
    },
    [isExam],
  );

  const handleRetake = useCallback(() => {
    setExamResult(null);
    setSession(null);
    setRetakeCount((n) => n + 1);
  }, []);

  // Sources from the CURRENT question's denormalized provenance (Phase D/E),
  // falling back to the set itself when a question was written from general
  // knowledge (no passage → "Show source" defers to Ask Mage).
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
    return set ? [{ id: set.id, title, kind: 'quiz', detail: 'Practice set' }] : [];
  }, [questionSource, set, title]);

  // A flat two-step rail — there's no slot mission here. The quiz is "current"
  // until results, then the terminal "Complete" step lights up.
  const mission = useMemo<MissionStep[]>(() => {
    const done = session?.mode === 'results' || examResult !== null;
    const label = isExam ? 'Mock exam' : isRemediation ? 'Weak-spot training' : 'Practice';
    return [
      { id: 'quiz', label, status: done ? 'done' : 'current' },
      { id: 'complete', label: 'Complete', status: 'finish' },
    ];
  }, [session?.mode, examResult, isExam, isRemediation]);

  const openMage = useCallback(() => {
    const q = session && set ? set.questions[session.index] : undefined;
    mage?.open({
      type: mageType,
      ids: { notebookId, quizSetId: setId, examId },
      title,
      activeQuestionId: session?.questionId ?? undefined,
      questionContext: buildQuizQuestionContext(q),
    });
  }, [mage, mageType, notebookId, setId, examId, title, session, set]);

  const mageActions = useMemo<MageQuickAction[]>(
    () => [
      { label: isExam ? 'Clarify the question' : 'Give a hint', onClick: openMage },
      { label: 'Explain the concept', onClick: openMage },
      ...(isExam ? [] : [{ label: 'Show related theory', onClick: openMage }]),
    ],
    [isExam, openMage],
  );

  const crumbs =
    breadcrumb ?? (isRemediation ? ['Practice', 'Weak spots'] : [isExam ? 'Mock exam' : 'Practice']);
  const pill = stepLabel ?? (isExam ? 'Mock exam' : isRemediation ? 'Weak-spot training' : 'Practice');
  const mageSubtitle = isExam
    ? 'Hints only — answers stay sealed'
    : isRemediation
      ? 'Re-teach first, then a quick check'
      : 'Hints first — not the answer';

  return (
    <QuizPlayerShell
      breadcrumb={crumbs}
      title={title}
      stepLabel={pill}
      session={session}
      // Remediation is graded=true (like exam) so the shell never offers the
      // formative "Try again" on a wrong re-test — the graded re-test is
      // answered once and feeds concept mastery (plan §6.4: no retries).
      graded={isExam || isRemediation}
      sealed={isExam}
      sources={sources}
      questionSource={questionSource}
      mission={mission}
      mageSubtitle={mageSubtitle}
      mageActions={mageActions}
      onAskMage={openMage}
      onShowSource={openMage}
      onClose={close}
      bodyOnly={!!loadError || !set || !!examResult}
    >
      {loadError ? (
        <p role="alert" style={{ color: 'var(--error)', fontSize: '14px' }}>
          {loadError}
        </p>
      ) : !set ? (
        <p style={{ color: 'var(--on-surface-variant)', fontSize: '14px' }}>Loading quiz…</p>
      ) : examResult ? (
        <ExamResultPanel
          result={examResult}
          onRetake={handleRetake}
          onDone={close}
          backLabel={examId ? 'Back to exam' : 'Done'}
        />
      ) : isRemediation ? (
        <RemediationBody
          notebookId={notebookId}
          setId={setId}
          questions={set.questions}
          onSession={setSession}
          onExit={close}
        />
      ) : (
        <QuizViewer
          key={retakeCount}
          notebookId={notebookId}
          setId={setId}
          title={set.title}
          initialQuestions={set.questions as never}
          isCheckpoint={isExam}
          sealed={isExam}
          onSession={setSession}
          onComplete={(result) => handleComplete(result)}
        />
      )}
    </QuizPlayerShell>
  );
}

// The mock-exam graded result. Always leads with the letter grade (it's graded),
// plus stars + the score. No hard pass/fail framing — a mock exam is a readiness
// rehearsal, so the copy points the learner back at studying.
function ExamResultPanel({
  result,
  onRetake,
  onDone,
  backLabel,
}: {
  result: ExamResult;
  onRetake: () => void;
  onDone: () => void;
  backLabel: string;
}) {
  const letterGrade = gradeForPercentage(result.percentage);
  const actions: GradedResultAction[] = [
    { label: 'Retake the mock exam', onClick: onRetake, icon: 'refresh' },
    { label: backLabel, onClick: onDone, variant: 'ghost' },
  ];
  return (
    <GradedResultPanel
      hero={letterGrade}
      heroSub={`${result.percentage}%`}
      tone={result.percentage >= 70 ? 'pass' : 'neutral'}
      title="Mock exam complete"
      message={
        result.percentage >= 70
          ? 'Solid run. Keep drilling the topics you slipped on to lift your readiness.'
          : 'A rehearsal, not a verdict — review your weak topics and run it again before the real thing.'
      }
      stars={result.stars}
      ariaScore={`Grade ${letterGrade}, ${result.percentage} percent`}
      actions={actions}
    />
  );
}
