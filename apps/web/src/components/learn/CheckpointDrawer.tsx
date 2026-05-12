'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import QuizViewer from '@/components/notebook/QuizViewer';
import ActivityList from '@/components/learn/ActivityList';
import type { PathActivity, PathSlot } from '@/components/learn/PathView';
import { gradeForPercentage } from '@/lib/path-gating';
import { trackEvent } from '@/lib/telemetry';

// Slide-in sheet (right edge on desktop, bottom on mobile) that hosts
// one slot's theory + quiz activities. URL state is owned by the parent
// page: ?slot=<slotId>&activity=<activityId>. Flashcards activities are
// rendered separately by CheckpointFlashcardViewer (full-screen) — the
// parent page picks which surface to mount based on activity.kind.
// Completion callbacks PATCH /api/learn/activities/[id] (or POST
// /assessment for assessment slots), then surface the updated slot to
// the parent so PathView's completion ring / star counts refresh
// without a full reload.

interface TheoryContentPayload {
  kind: 'theory';
  theory: { id: string; title: string; body: unknown };
}
interface QuizSetPayload {
  kind: 'quiz';
  quizSet: {
    id: string;
    notebookId: string | null;
    title: string;
    questions: Array<{
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
    }>;
  };
}
type ActivityContent = TheoryContentPayload | QuizSetPayload;

interface CheckpointDrawerProps {
  slot: PathSlot;
  /** Active activity id from the URL, or null to show the list view. */
  activityId: string | null;
  /** Update the URL — null pops back to the list view. */
  onSelectActivity: (activityId: string | null) => void;
  /** Close the drawer entirely (clear ?slot= as well). */
  onClose: () => void;
  /** Fired when activity progress changes so PathView can refresh. */
  onSlotChanged: () => void;
}

const SLOT_KIND_LABEL: Record<string, string> = {
  learning: 'Learning',
  review: 'Review',
  assessment: 'Checkpoint',
  final_exam: 'Final Exam',
};

export default function CheckpointDrawer({
  slot,
  activityId,
  onSelectActivity,
  onClose,
  onSlotChanged,
}: CheckpointDrawerProps) {
  const [content, setContent] = useState<ActivityContent | null>(null);
  const [contentLoading, setContentLoading] = useState(false);
  const [contentError, setContentError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [assessmentResult, setAssessmentResult] = useState<{
    starsEarned: number;
    percentage: number;
    passed: boolean;
  } | null>(null);
  // Incremented when the learner retakes a failed assessment so the
  // QuizViewer remounts and its internal answer state resets.
  const [retakeCount, setRetakeCount] = useState(0);
  const drawerRef = useRef<HTMLElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Phase 10.7 — telemetry. One event per slot the drawer hosts, with
  // the slot kind so analytics can split usage by learning vs review
  // vs assessment.
  useEffect(() => {
    trackEvent('path.slot.opened', { slotId: slot.id, slotKind: slot.kind });
  }, [slot.id, slot.kind]);

  // Phase 10.7 — escape closes the drawer; focus the drawer container
  // on mount so screen readers + keyboard users see the new context.
  // Restores focus to the previously focused element on close.
  useEffect(() => {
    previousFocusRef.current = (document.activeElement as HTMLElement) ?? null;
    drawerRef.current?.focus();
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        ev.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previousFocusRef.current?.focus?.();
    };
  }, [onClose]);

  const activeActivity: PathActivity | null = useMemo(() => {
    if (!activityId) return null;
    return slot.activities.find((a) => a.id === activityId) ?? null;
  }, [slot.activities, activityId]);

  // Fetch the content body whenever the active activity changes.
  useEffect(() => {
    if (!activeActivity) {
      setContent(null);
      setContentError(null);
      setAssessmentResult(null);
      return;
    }
    // Phase 10.7 — fire when the user actually opens an activity (not
    // when they reach the slot's list view). Useful for measuring
    // funnel from slot.opened → activity.opened → activity.completed.
    trackEvent('path.activity.opened', {
      slotId: slot.id,
      slotKind: slot.kind,
      activityId: activeActivity.id,
      activityKind: activeActivity.kind,
    });
    let cancelled = false;
    setContentLoading(true);
    setContentError(null);
    (async () => {
      try {
        const res = await fetch(
          `/api/learn/activities/${encodeURIComponent(activeActivity.id)}/content`,
        );
        const json = await res.json();
        if (cancelled) return;
        if (!json?.success) {
          setContentError(json?.error ?? 'Could not load activity.');
          setContent(null);
        } else {
          setContent(json.data as ActivityContent);
        }
      } catch {
        if (!cancelled) {
          setContentError('Network error. Try again.');
          setContent(null);
        }
      } finally {
        if (!cancelled) setContentLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeActivity]);

  // ── Completion handlers ───────────────────────────────────────────

  // Mark a non-assessment activity (theory / flashcards / learning
  // quiz) as completed. PATCH then return to the list so the user
  // sees the next "Up next" CTA.
  const completeActivity = useCallback(
    async (id: string) => {
      setSubmitting(true);
      try {
        const res = await fetch(`/api/learn/activities/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ completed: true }),
        });
        if (res.ok) {
          onSlotChanged();
          onSelectActivity(null);
        }
      } catch (err) {
        console.error('[CheckpointDrawer] completeActivity', err);
      } finally {
        setSubmitting(false);
      }
    },
    [onSelectActivity, onSlotChanged],
  );

  // Assessment quiz finish: POST /assessment which returns starsEarned.
  const submitAssessment = useCallback(
    async (result: { score: number; total: number }) => {
      try {
        const res = await fetch(
          `/api/learn/slots/${encodeURIComponent(slot.id)}/assessment`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(result),
          },
        );
        const json = await res.json();
        if (json?.success && json.data) {
          setAssessmentResult({
            starsEarned: json.data.starsEarned,
            percentage: json.data.percentage,
            passed: json.data.passed,
          });
          onSlotChanged();
        }
      } catch (err) {
        console.error('[CheckpointDrawer] submitAssessment', err);
      }
    },
    [slot.id, onSlotChanged],
  );

  return (
    <>
      <div
        aria-hidden
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.55)',
          backdropFilter: 'blur(2px)',
          zIndex: 1200,
        }}
      />
      <aside
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label={slot.title}
        tabIndex={-1}
        className="checkpoint-drawer"
        style={{
          position: 'fixed',
          background: 'var(--surface)',
          color: 'var(--on-surface)',
          zIndex: 1210,
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 0 32px rgba(0, 0, 0, 0.45)',
          outline: 'none',
        }}
      >
        <style>{`
          .checkpoint-drawer {
            top: 0;
            right: 0;
            bottom: 0;
            width: min(480px, 100vw);
            border-left: 1px solid var(--outline-variant);
            animation: drawerSlideIn 0.22s cubic-bezier(0.22, 1, 0.36, 1) both;
          }
          @media (max-width: 768px) {
            .checkpoint-drawer {
              top: auto;
              left: 0;
              right: 0;
              bottom: 0;
              width: 100%;
              max-height: 90vh;
              border-left: none;
              border-top: 1px solid var(--outline-variant);
              border-top-left-radius: var(--radius-xl);
              border-top-right-radius: var(--radius-xl);
              animation: drawerSlideUp 0.22s cubic-bezier(0.22, 1, 0.36, 1) both;
            }
          }
          @keyframes drawerSlideIn {
            from { transform: translateX(100%); opacity: 0; }
            to   { transform: translateX(0);    opacity: 1; }
          }
          @keyframes drawerSlideUp {
            from { transform: translateY(100%); opacity: 0; }
            to   { transform: translateY(0);    opacity: 1; }
          }
          @media (prefers-reduced-motion: reduce) {
            .checkpoint-drawer { animation: none; }
          }
        `}</style>

        {/* Header */}
        <header
          style={{
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px',
            borderBottom: '1px solid var(--outline-variant)',
            background: 'var(--surface-container-low)',
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
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
            </div>
            <h2
              style={{
                margin: '6px 0 0',
                fontFamily: 'var(--font-display)',
                fontSize: '18px',
                fontWeight: 800,
                color: 'var(--on-surface)',
                letterSpacing: '-0.01em',
              }}
            >
              {slot.title}
            </h2>
            {/* Progress dots */}
            {slot.activities.length > 0 ? (
              <div
                aria-label="Activity progress"
                style={{
                  marginTop: '8px',
                  display: 'flex',
                  gap: '4px',
                }}
              >
                {slot.activities.map((a) => (
                  <span
                    key={a.id}
                    aria-hidden
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: a.completed
                        ? 'var(--primary)'
                        : a.id === activityId
                          ? 'var(--on-surface)'
                          : 'var(--outline-variant)',
                    }}
                  />
                ))}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close drawer"
            style={{
              width: '32px',
              height: '32px',
              borderRadius: 'var(--radius-full)',
              border: '1px solid var(--outline-variant)',
              background: 'transparent',
              color: 'var(--on-surface)',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
              close
            </span>
          </button>
        </header>

        {/* Body */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '18px 20px 24px',
          }}
        >
          {!activeActivity ? (
            <ActivityList slot={slot} onOpenActivity={(a) => onSelectActivity(a.id)} />
          ) : contentLoading ? (
            <p style={{ color: 'var(--on-surface-variant)', fontSize: '14px' }}>
              Loading activity…
            </p>
          ) : contentError ? (
            <p role="alert" style={{ color: 'var(--error)', fontSize: '14px' }}>
              {contentError}
            </p>
          ) : !content ? null : (
            <ActivityBody
              activity={activeActivity}
              content={content}
              slotKind={slot.kind}
              submitting={submitting}
              assessmentResult={assessmentResult}
              retakeCount={retakeCount}
              onBackToList={() => onSelectActivity(null)}
              onCloseDrawer={onClose}
              onMarkComplete={() => completeActivity(activeActivity.id)}
              onRetakeAssessment={() => {
                setAssessmentResult(null);
                setRetakeCount((n) => n + 1);
              }}
              onQuizComplete={(result) => {
                if (slot.kind === 'assessment' || slot.kind === 'final_exam') {
                  void submitAssessment({ score: result.score, total: result.total });
                } else {
                  void completeActivity(activeActivity.id);
                }
              }}
            />
          )}
        </div>
      </aside>
    </>
  );
}

// ── Inner activity bodies ───────────────────────────────────────────

interface ActivityBodyProps {
  activity: PathActivity;
  content: ActivityContent;
  slotKind: string;
  submitting: boolean;
  assessmentResult: { starsEarned: number; percentage: number; passed: boolean } | null;
  retakeCount: number;
  onBackToList: () => void;
  onCloseDrawer: () => void;
  onMarkComplete: () => void;
  onRetakeAssessment: () => void;
  onQuizComplete: (result: {
    score: number;
    total: number;
    percentage: number;
  }) => void;
}

function ActivityBody({
  activity,
  content,
  slotKind,
  submitting,
  assessmentResult,
  retakeCount,
  onBackToList,
  onCloseDrawer,
  onMarkComplete,
  onRetakeAssessment,
  onQuizComplete,
}: ActivityBodyProps) {
  // Theory + flashcards both have their own full-screen viewers
  // (CheckpointTheoryViewer + CheckpointFlashcardViewer); the parent
  // page routes those activity kinds away from this drawer before they
  // ever reach ActivityBody. Quiz still renders inline below until its
  // full-screen viewer ships.
  if (content.kind === 'quiz' && activity.kind === 'quiz') {
    if (assessmentResult) {
      return (
        <AssessmentResultPanel
          result={assessmentResult}
          slotKind={slotKind}
          onBackToList={onBackToList}
          onRetake={onRetakeAssessment}
          onReviewTheory={onCloseDrawer}
        />
      );
    }
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {content.quizSet.notebookId ? (
          <QuizViewer
            key={retakeCount}
            notebookId={content.quizSet.notebookId}
            setId={content.quizSet.id}
            title={content.quizSet.title}
            initialQuestions={content.quizSet.questions as never}
            isCheckpoint={slotKind === 'assessment' || slotKind === 'final_exam'}
            onComplete={(result) => onQuizComplete(result)}
          />
        ) : (
          <p style={{ color: 'var(--error)', fontSize: '14px' }}>
            This quiz isn&apos;t linked to a notebook yet.
          </p>
        )}
        <button type="button" onClick={onBackToList} style={ghostBtnStyle}>
          ← Back to activities
        </button>
      </div>
    );
  }

  return (
    <p style={{ color: 'var(--error)', fontSize: '14px' }}>
      Activity content type doesn&apos;t match. Please refresh.
    </p>
  );
}

function AssessmentResultPanel({
  result,
  slotKind,
  onBackToList,
  onRetake,
  onReviewTheory,
}: {
  result: { starsEarned: number; percentage: number; passed: boolean };
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
        }}
      >
        {result.passed
          ? slotKind === 'final_exam'
            ? 'Final exam cleared — path complete!'
            : 'Checkpoint cleared!'
          : 'Not quite — 70% needed to pass'}
      </h3>
      <div
        aria-label={`Grade ${letterGrade}, ${result.percentage} percent`}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '4px',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '56px',
            fontWeight: 800,
            lineHeight: 1,
            letterSpacing: '-0.04em',
            color: result.passed ? 'var(--tertiary-container)' : 'var(--error)',
          }}
        >
          {letterGrade}
        </span>
        <span
          style={{
            fontSize: '13px',
            fontWeight: 700,
            color: 'var(--on-surface-variant)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {result.percentage}%
        </span>
      </div>
      <p
        style={{
          margin: 0,
          fontSize: '14px',
          color: 'var(--on-surface-variant)',
          textAlign: 'center',
          maxWidth: '360px',
        }}
      >
        {result.passed
          ? slotKind === 'final_exam'
            ? 'Congratulations on finishing the path.'
            : 'Great work — the next section is unlocked.'
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
            maxWidth: '320px',
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

// ── Button styles ───────────────────────────────────────────────────

const primaryBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '10px 16px',
  background: 'var(--primary)',
  color: 'var(--on-primary)',
  border: 'none',
  borderRadius: 'var(--radius-full)',
  fontSize: '13px',
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const ghostBtnStyle: React.CSSProperties = {
  ...primaryBtnStyle,
  background: 'transparent',
  color: 'var(--on-surface-variant)',
  border: '1px solid var(--outline-variant)',
};
