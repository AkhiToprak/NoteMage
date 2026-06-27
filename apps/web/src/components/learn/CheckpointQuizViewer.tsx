'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import QuizViewer from '@/components/notebook/QuizViewer';
import DiagramReferencePanel from '@/components/learn/DiagramReferencePanel';
import type { PathActivity, PathSlot } from '@/components/learn/PathView';
import { readUnlocked, type PathUnlock } from '@/components/learn/path-rewards';
import { CheckpointSkeletonBody } from '@/components/learn/CheckpointSkeleton';
import { gradeForPercentage } from '@/lib/path-gating';
import { trackEvent } from '@/lib/telemetry';
import QuizPlayerShell from '@/components/quiz/player/QuizPlayerShell';
import GradedResultPanel, { type GradedResultAction } from '@/components/quiz/player/GradedResultPanel';
import { useOptionalMage } from '@/components/mage/MageProvider';
import type { MageQuickAction, MissionStep, QuizSession, QuizSource } from '@/components/quiz/player/types';

// Map a path activity kind → the Mission rail label. Mirrors the Figma rail
// (Theory · Quick Check · Practice · Complete).
const ACTIVITY_MISSION_LABEL: Record<string, string> = {
  theory: 'Theory',
  quiz: 'Quick Check',
  flashcards: 'Practice',
};

// Map a source label (usually a file name) to the Sources icon family (Phase D).
function inferSourceKind(label?: string | null): QuizSource['kind'] {
  const l = (label ?? '').trim().toLowerCase();
  if (l.endsWith('.pdf')) return 'pdf';
  if (l.endsWith('.ppt') || l.endsWith('.pptx') || l.endsWith('.key')) return 'ppt';
  if (l.endsWith('.doc') || l.endsWith('.docx')) return 'doc';
  return 'page';
}

// Full-screen viewer for checkpoint quiz activities. Mirrors the
// CheckpointTheoryViewer + CheckpointFlashcardViewer shell. For graded
// slots (assessment + final_exam) it submits to /assessment, then renders
// the result panel (letter grade + stars + retake/back). For learning /
// review-slot quizzes it just PATCHes the activity and exits.

interface QuizQuestion {
  id: string;
  kind: string;
  payload: unknown;
  question: string;
  options: string[];
  correctIndex: number;
  hint: string | null;
  correctExplanation: string | null;
  wrongExplanation: string | null;
  // Source provenance (Phase D) — denormalized grounding the reader drawer
  // highlights. Null on legacy rows / questions written from general knowledge.
  sourceLabel?: string | null;
  sourcePage?: number | null;
  sourceQuote?: string | null;
  sortOrder: number;
  // Figure-reuse (P4): exhibit image (0-or-1) threaded from the content route
  // into QuizViewer, which renders it above the prompt.
  image?: { id: string; caption: string | null } | null;
}

interface QuizSetPayload {
  kind: 'quiz';
  quizSet: {
    id: string;
    notebookId: string | null;
    title: string;
    questions: QuizQuestion[];
    // Path-diagrams revival (Phase 3): set-level reference diagrams (loose JSON,
    // validated client-side by DiagramReferencePanel). Null when none apply.
    diagrams?: unknown;
  };
}

interface AssessmentResult {
  starsEarned: number;
  percentage: number;
  passed: boolean;
}

const SLOT_KIND_LABEL: Record<string, string> = {
  learning: 'Learning',
  review: 'Review',
  assessment: 'Checkpoint',
  final_exam: 'Final Exam',
};

interface CheckpointQuizViewerProps {
  slot: PathSlot;
  activity: PathActivity;
  onClose: () => void;
  onCompleted: (unlocked?: PathUnlock[]) => void;
  // Refresh path progress WITHOUT closing the viewer. Used when an ungraded
  // review quiz finishes so the eval screen stays up until the learner closes
  // it themselves, while the path behind reflects the completion.
  onProgress: () => void;
  // Tutorial mode: let the learner continue past a failed graded quiz instead
  // of being stranded on the retake screen. The guided sample is a demo, not a
  // real gate, so the fail panel gains a "Continue anyway" action that advances
  // the flow (fires onCompleted) without requiring a pass.
  allowContinueOnFail?: boolean;
  // Phase A — path context for the QuizPlayerShell header breadcrumb + the
  // Ask-Mage grounding ids. Optional so the tutorial player can omit them.
  pathTitle?: string;
  pathId?: string;
}

export default function CheckpointQuizViewer({
  slot,
  activity,
  onClose,
  onCompleted,
  onProgress,
  allowContinueOnFail = false,
  pathTitle,
  pathId,
}: CheckpointQuizViewerProps) {
  const [quizSet, setQuizSet] = useState<QuizSetPayload['quizSet'] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [assessmentResult, setAssessmentResult] = useState<AssessmentResult | null>(null);
  // Bumped on retake so QuizViewer remounts and its internal answer state resets.
  const [retakeCount, setRetakeCount] = useState(0);
  // Phase A — live session state reported up from QuizViewer (external chrome).
  const [session, setSession] = useState<QuizSession | null>(null);
  const mage = useOptionalMage();
  // Achievements unlocked by passing this checkpoint (e.g. path_complete);
  // surfaced when the learner clicks back-to-list.
  const unlockedRef = useRef<PathUnlock[]>([]);

  const isGraded = slot.kind === 'assessment' || slot.kind === 'final_exam';

  useEffect(() => {
    trackEvent('path.activity.opened', {
      slotId: slot.id,
      slotKind: slot.kind,
      activityId: activity.id,
      activityKind: activity.kind,
    });
  }, [slot.id, slot.kind, activity.id, activity.kind]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/learn/activities/${encodeURIComponent(activity.id)}/content`,
        );
        const json = await res.json();
        if (cancelled) return;
        if (!json?.success) {
          setLoadError(json?.error ?? 'Could not load quiz.');
          return;
        }
        const payload = json.data as QuizSetPayload;
        if (payload?.kind !== 'quiz') {
          setLoadError('Unexpected activity content.');
          return;
        }
        setQuizSet(payload.quizSet);
      } catch {
        if (!cancelled) setLoadError('Network error. Try again.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activity.id]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleQuizComplete = useCallback(
    async (result: { attemptId: string; score: number; total: number; percentage: number }) => {
      if (isGraded) {
        try {
          const res = await fetch(
            `/api/learn/slots/${encodeURIComponent(slot.id)}/assessment`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              // Send the server-graded attempt id, NOT a client-computed score —
              // the endpoint re-derives the grade from the attempt the caller owns.
              body: JSON.stringify({ attemptId: result.attemptId }),
            },
          );
          const json = await res.json();
          if (json?.success && json.data) {
            setAssessmentResult({
              starsEarned: json.data.starsEarned,
              percentage: json.data.percentage,
              passed: json.data.passed,
            });
            unlockedRef.current = readUnlocked(json);
          }
        } catch (err) {
          console.error('[CheckpointQuizViewer] submitAssessment', err);
        }
        return;
      }
      // Non-graded quiz (review slot): just mark the activity complete.
      try {
        const res = await fetch(
          `/api/learn/activities/${encodeURIComponent(activity.id)}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ completed: true }),
          },
        );
        // Mark the review activity complete and refresh path progress, but
        // keep the eval screen open — the learner dismisses it via the close
        // button instead of having it vanish under them.
        if (res.ok) onProgress();
      } catch (err) {
        console.error('[CheckpointQuizViewer] completeActivity', err);
      }
    },
    [isGraded, slot.id, activity.id, onProgress],
  );

  const handleRetake = useCallback(() => {
    setAssessmentResult(null);
    setSession(null);
    setRetakeCount((n) => n + 1);
  }, []);

  // Mission rail from the slot's activities + a terminal "Complete" step. The
  // current activity is "in progress"; completed ones are done; the rest locked.
  const mission = useMemo<MissionStep[]>(() => {
    const steps: MissionStep[] = slot.activities
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((a) => ({
        id: a.id,
        label: ACTIVITY_MISSION_LABEL[a.kind] ?? a.title,
        status: a.id === activity.id ? 'current' : a.completed ? 'done' : 'locked',
      }));
    steps.push({ id: `${slot.id}-complete`, label: 'Complete', status: 'finish' });
    return steps;
  }, [slot.activities, slot.id, activity.id]);

  // Step pill: "<label> · Step N of M" (Figma: "Quick Check · Step 2 of 4").
  const stepLabel = useMemo(() => {
    const ordered = slot.activities.slice().sort((a, b) => a.sortOrder - b.sortOrder);
    const idx = ordered.findIndex((a) => a.id === activity.id);
    const label = ACTIVITY_MISSION_LABEL[activity.kind] ?? SLOT_KIND_LABEL[slot.kind] ?? 'Quiz';
    const total = ordered.length + 1; // +1 for the terminal Complete step
    return idx >= 0 ? `${label} · Step ${idx + 1} of ${total}` : label;
  }, [slot.activities, slot.kind, activity.id, activity.kind]);

  const breadcrumb = useMemo(
    () => (pathTitle ? [pathTitle, slot.title] : [slot.title]),
    [pathTitle, slot.title],
  );

  // Sources (Phase D) — the CURRENT question's denormalized provenance drives
  // both the Sources card and the reader drawer: when the generator grounded the
  // question (sourceQuote present) we show that file/page with the passage to
  // highlight; otherwise we fall back to the learning path (honest — the quiz IS
  // generated from the path's material), which has no passage so "Show source"
  // defers to Ask Mage.
  const questionSource = useMemo<QuizSource | undefined>(() => {
    const q = session && quizSet ? quizSet.questions[session.index] : undefined;
    if (!q || !q.sourceQuote) return undefined;
    return {
      id: `q-${q.id}`,
      title: q.sourceLabel?.trim() || pathTitle || 'Source material',
      kind: inferSourceKind(q.sourceLabel),
      detail: q.sourcePage != null ? `Page ${q.sourcePage}` : undefined,
      quote: q.sourceQuote,
    };
  }, [session, quizSet, pathTitle]);

  const sources = useMemo<QuizSource[]>(() => {
    if (questionSource) return [questionSource];
    return pathTitle ? [{ id: pathId ?? slot.id, title: pathTitle, kind: 'path', detail: 'Learning path' }] : [];
  }, [questionSource, pathTitle, pathId, slot.id]);

  const openMage = useCallback(() => {
    mage?.open({
      type: 'quiz-question',
      ids: { pathId, slotId: slot.id, quizSetId: quizSet?.id },
      title: slot.title,
      activeQuestionId: session?.questionId ?? undefined,
    });
  }, [mage, pathId, slot.id, slot.title, quizSet?.id, session?.questionId]);

  const mageActions = useMemo<MageQuickAction[]>(
    () => [
      { label: 'Explain the concept', onClick: openMage },
      { label: 'Give a hint', onClick: openMage },
      { label: 'Show related theory', onClick: openMage },
    ],
    [openMage],
  );

  return (
    <QuizPlayerShell
      breadcrumb={breadcrumb}
      title={slot.title}
      stepLabel={stepLabel}
      session={session}
      graded={isGraded}
      sources={sources}
      questionSource={questionSource}
      mission={mission}
      mageSubtitle="Hints first — not the answer"
      mageActions={mageActions}
      onAskMage={openMage}
      onShowSource={openMage}
      onClose={onClose}
      bodyOnly={!!loadError || !quizSet || !!assessmentResult}
    >
      {loadError ? (
        <p role="alert" style={{ color: 'var(--error)', fontSize: '14px' }}>
          {loadError}
        </p>
      ) : !quizSet ? (
        <CheckpointSkeletonBody kind="quiz" />
      ) : assessmentResult ? (
        <AssessmentResultPanel
          result={assessmentResult}
          slotKind={slot.kind}
          onBackToList={() => onCompleted(unlockedRef.current)}
          onRetake={handleRetake}
          onReviewTheory={onClose}
          onContinueAnyway={
            allowContinueOnFail ? () => onCompleted(unlockedRef.current) : undefined
          }
        />
      ) : quizSet.notebookId ? (
        <>
          {/* Reference diagrams copied from the covered theory — collapsed by
              default, above the question. (Path quizzes rarely carry diagrams,
              so this is usually empty in the MC slice.) */}
          <DiagramReferencePanel diagrams={quizSet.diagrams} />
          <QuizViewer
            key={retakeCount}
            notebookId={quizSet.notebookId}
            setId={quizSet.id}
            title={quizSet.title}
            initialQuestions={quizSet.questions as never}
            isCheckpoint={isGraded}
            hideManagementActions
            externalChrome
            onSession={setSession}
            onComplete={(result) => void handleQuizComplete(result)}
          />
        </>
      ) : (
        <p style={{ color: 'var(--error)', fontSize: '14px' }}>
          This quiz isn&apos;t linked to a notebook yet.
        </p>
      )}
    </QuizPlayerShell>
  );
}

// Maps the path-checkpoint assessment result onto the shared cream
// GradedResultPanel. The pass gate is 70%; a miss leads with the score (not a
// red "F") per the product's no-punitive-report-card stance.
function AssessmentResultPanel({
  result,
  slotKind,
  onBackToList,
  onRetake,
  onReviewTheory,
  onContinueAnyway,
}: {
  result: AssessmentResult;
  slotKind: string;
  onBackToList: () => void;
  onRetake: () => void;
  onReviewTheory: () => void;
  /** Tutorial only: advance past a fail without passing. Omitted elsewhere. */
  onContinueAnyway?: () => void;
}) {
  const isGraded = slotKind === 'assessment' || slotKind === 'final_exam';
  const isFinal = slotKind === 'final_exam';
  const letterGrade = gradeForPercentage(result.percentage);

  const title = result.passed
    ? isFinal
      ? 'Final exam cleared. Path complete!'
      : 'Checkpoint cleared!'
    : 'Almost there. 70% to pass.';

  const message = result.passed
    ? isFinal
      ? 'Congratulations on finishing the path.'
      : 'Great work. The next section is unlocked.'
    : isFinal
      ? 'Review the sections you struggled with, then retake the final exam.'
      : 'Review the earlier theory slots, then retake the assessment to unlock the next section.';

  const actions: GradedResultAction[] = result.passed
    ? [{ label: 'Back to activities', onClick: onBackToList }]
    : isGraded
      ? [
          { label: isFinal ? 'Retake the final exam' : 'Retake the assessment', onClick: onRetake },
          { label: 'Review the theory', onClick: onReviewTheory, variant: 'ghost' },
          ...(onContinueAnyway
            ? [{ label: 'Continue anyway', onClick: onContinueAnyway, variant: 'ghost' as const }]
            : []),
        ]
      : [{ label: 'Try again', onClick: onRetake }];

  return (
    <GradedResultPanel
      hero={result.passed ? letterGrade : `${result.percentage}%`}
      heroSub={result.passed ? `${result.percentage}%` : '70% to pass'}
      tone={result.passed ? 'pass' : 'neutral'}
      title={title}
      message={message}
      stars={result.starsEarned}
      ariaScore={
        result.passed
          ? `Grade ${letterGrade}, ${result.percentage} percent`
          : `${result.percentage} percent, 70 percent needed to pass`
      }
      actions={actions}
    />
  );
}
