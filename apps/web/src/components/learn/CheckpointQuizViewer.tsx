'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import QuizViewer from '@/components/notebook/QuizViewer';
import type { PathActivity, PathSlot } from '@/components/learn/PathView';
import { gradeForPercentage } from '@/lib/path-gating';
import { trackEvent } from '@/lib/telemetry';

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
  sortOrder: number;
}

interface QuizSetPayload {
  kind: 'quiz';
  quizSet: {
    id: string;
    notebookId: string | null;
    title: string;
    questions: QuizQuestion[];
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
  onCompleted: () => void;
  // Refresh path progress WITHOUT closing the viewer. Used when an ungraded
  // review quiz finishes so the eval screen stays up until the learner closes
  // it themselves, while the path behind reflects the completion.
  onProgress: () => void;
}

export default function CheckpointQuizViewer({
  slot,
  activity,
  onClose,
  onCompleted,
  onProgress,
}: CheckpointQuizViewerProps) {
  const [quizSet, setQuizSet] = useState<QuizSetPayload['quizSet'] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [assessmentResult, setAssessmentResult] = useState<AssessmentResult | null>(null);
  // Bumped on retake so QuizViewer remounts and its internal answer state resets.
  const [retakeCount, setRetakeCount] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

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
    previousFocusRef.current = (document.activeElement as HTMLElement) ?? null;
    containerRef.current?.focus();
    return () => {
      previousFocusRef.current?.focus?.();
    };
  }, []);

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
    setRetakeCount((n) => n + 1);
  }, []);

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-label={`${slot.title} quiz`}
      tabIndex={-1}
      className="checkpoint-quiz"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--surface)',
        color: 'var(--on-surface)',
        zIndex: 1300,
        display: 'flex',
        flexDirection: 'column',
        outline: 'none',
      }}
    >
      <style>{`
        .checkpoint-quiz {
          animation: cqOverlayIn 0.22s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        @keyframes cqOverlayIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          .checkpoint-quiz { animation: none; }
        }
      `}</style>

      <header
        style={{
          padding: '14px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          borderBottom: '1px solid var(--outline-variant)',
          background: 'var(--surface-container-low)',
        }}
      >
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}
        >
          <span
            style={{
              alignSelf: 'flex-start',
              display: 'inline-flex',
              alignItems: 'center',
              padding: '2px 10px',
              background: 'var(--primary)',
              color: 'var(--on-primary)',
              borderRadius: 'var(--radius-full)',
              fontSize: '10px',
              fontWeight: 800,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
            }}
          >
            {SLOT_KIND_LABEL[slot.kind] ?? slot.kind}
          </span>
          <h2
            style={{
              margin: 0,
              fontFamily: 'var(--font-display)',
              fontSize: '18px',
              fontWeight: 800,
              color: 'var(--on-surface)',
              letterSpacing: '-0.01em',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {slot.title}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close quiz"
          style={{
            width: '36px',
            height: '36px',
            borderRadius: 'var(--radius-full)',
            border: '1px solid var(--outline-variant)',
            background: 'transparent',
            color: 'var(--on-surface)',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            fontFamily: 'inherit',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
            close
          </span>
        </button>
      </header>

      <div
        style={{
          flex: 1,
          overflow: 'auto',
          minHeight: 0,
          // Flex column so the 720px wrapper (and the QuizViewer inside it) can
          // fill this scroll region's height — that's what lets QuizViewer's
          // pinned bottom bar actually sit at the bottom on short questions.
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            maxWidth: '720px',
            width: '100%',
            margin: '0 auto',
            flex: 1,
            minHeight: 0,
            padding: 'clamp(16px, 3vh, 24px) 20px 0',
          }}
        >
          {loadError ? (
            <p role="alert" style={{ color: 'var(--error)', fontSize: '14px' }}>
              {loadError}
            </p>
          ) : !quizSet ? (
            <p style={{ color: 'var(--on-surface-variant)', fontSize: '14px' }}>
              Loading quiz…
            </p>
          ) : assessmentResult ? (
            <AssessmentResultPanel
              result={assessmentResult}
              slotKind={slot.kind}
              onBackToList={onCompleted}
              onRetake={handleRetake}
              onReviewTheory={onClose}
            />
          ) : quizSet.notebookId ? (
            <QuizViewer
              key={retakeCount}
              notebookId={quizSet.notebookId}
              setId={quizSet.id}
              title={quizSet.title}
              initialQuestions={quizSet.questions as never}
              isCheckpoint={isGraded}
              hideManagementActions
              onComplete={(result) => void handleQuizComplete(result)}
            />
          ) : (
            <p style={{ color: 'var(--error)', fontSize: '14px' }}>
              This quiz isn&apos;t linked to a notebook yet.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function AssessmentResultPanel({
  result,
  slotKind,
  onBackToList,
  onRetake,
  onReviewTheory,
}: {
  result: AssessmentResult;
  slotKind: string;
  onBackToList: () => void;
  onRetake: () => void;
  onReviewTheory: () => void;
}) {
  const isGraded = slotKind === 'assessment' || slotKind === 'final_exam';
  const letterGrade = gradeForPercentage(result.percentage);
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '16px',
        padding: '24px 8px',
      }}
    >
      <h3
        style={{
          margin: 0,
          fontFamily: 'var(--font-display)',
          fontSize: '24px',
          fontWeight: 800,
          color: 'var(--on-surface)',
          letterSpacing: '-0.01em',
          textAlign: 'center',
        }}
      >
        {result.passed
          ? slotKind === 'final_exam'
            ? 'Final exam cleared. Path complete!'
            : 'Checkpoint cleared!'
          : 'Almost there. 70% to pass.'}
      </h3>
      <div
        aria-label={
          result.passed
            ? `Grade ${letterGrade}, ${result.percentage} percent`
            : `${result.percentage} percent, 70 percent needed to pass`
        }
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '4px',
        }}
      >
        {/* On a fail, lead with the score and what's needed — not a red "F"
            letter grade. The product avoids punitive report-card framing. */}
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '56px',
            fontWeight: 800,
            lineHeight: 1,
            letterSpacing: '-0.04em',
            color: result.passed ? 'var(--tertiary-container)' : 'var(--on-surface)',
          }}
        >
          {result.passed ? letterGrade : `${result.percentage}%`}
        </span>
        <span
          style={{
            fontSize: '13px',
            fontWeight: 700,
            color: 'var(--on-surface-variant)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {result.passed ? `${result.percentage}%` : '70% to pass'}
        </span>
      </div>
      <p
        style={{
          margin: 0,
          fontSize: '14px',
          color: 'var(--on-surface-variant)',
          textAlign: 'center',
          maxWidth: 'min(360px, calc(100vw - 32px))',
        }}
      >
        {result.passed
          ? slotKind === 'final_exam'
            ? 'Congratulations on finishing the path.'
            : 'Great work. The next section is unlocked.'
          : slotKind === 'final_exam'
            ? 'Review the sections you struggled with, then retake the final exam.'
            : 'Review the earlier theory slots, then retake the assessment to unlock the next section.'}
      </p>
      <div
        aria-label={`${result.starsEarned} of 3 stars`}
        style={{ display: 'flex', gap: '6px' }}
      >
        {[0, 1, 2].map((i) => {
          const earned = i < result.starsEarned;
          return (
            <span
              key={i}
              aria-hidden
              className="material-symbols-outlined"
              style={{
                fontSize: '40px',
                color: earned ? 'var(--tertiary-container)' : 'var(--outline-variant)',
                fontVariationSettings: earned ? '"FILL" 1' : '"FILL" 0',
              }}
            >
              star
            </span>
          );
        })}
      </div>
      {result.passed ? (
        <button type="button" onClick={onBackToList} style={primaryBtnStyle}>
          Back to activities
        </button>
      ) : isGraded ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            width: '100%',
            maxWidth: 'min(320px, calc(100vw - 32px))',
          }}
        >
          <button type="button" onClick={onRetake} style={primaryBtnStyle}>
            {slotKind === 'final_exam' ? 'Retake the final exam' : 'Retake the assessment'}
          </button>
          <button type="button" onClick={onReviewTheory} style={ghostBtnStyle}>
            Review the theory
          </button>
        </div>
      ) : (
        <button type="button" onClick={onRetake} style={primaryBtnStyle}>
          Try again
        </button>
      )}
    </div>
  );
}

const primaryBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  padding: '10px 18px',
  background: 'var(--primary)',
  color: 'var(--on-primary)',
  border: 'none',
  borderRadius: 'var(--radius-full)',
  fontSize: '13px',
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'inherit',
  minWidth: '140px',
};

const ghostBtnStyle: React.CSSProperties = {
  ...primaryBtnStyle,
  background: 'transparent',
  color: 'var(--on-surface-variant)',
  border: '1px solid var(--outline-variant)',
};
