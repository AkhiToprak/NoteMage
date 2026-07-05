'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { readUnlocked, type PathUnlock } from '@/components/learn/path-rewards';
import { CheckpointSkeletonBody } from '@/components/learn/CheckpointSkeleton';
import type { PathActivity, PathSlot } from '@/components/learn/PathView';
import { trackEvent } from '@/lib/telemetry';
import QuizPlayerShell from '@/components/quiz/player/QuizPlayerShell';
import TheoryActivityCard from '@/components/quiz/player/TheoryActivityCard';
import QuickRecall from '@/components/quiz/player/QuickRecall';
import { useOptionalMage } from '@/components/mage/MageProvider';
import { useRegisterMageContext } from '@/components/mage';
import type { MageQuickAction, MissionStep, QuizSource } from '@/components/quiz/player/types';

// Full-screen viewer for checkpoint theory activities. Phase C of the "Quiz
// screens" redesign: theory now rides the same warm-cream QuizPlayerShell as
// quizzes (header breadcrumb · step pill · Sources / Ask Mage / Mission sidebar
// · sticky action bar) instead of the old bare dark overlay. The lesson renders
// in a Core-concept card (TheoryActivityCard); a Quick-recall reveal under it
// self-checks the learner using the slot's first sibling flashcard. The content
// fetch + "mark read" completion POST are unchanged.

interface TheoryContentPayload {
  kind: 'theory';
  theory: {
    id: string;
    title: string;
    body: unknown;
    // Source-highlighting feature — the lesson's primary grounding anchor.
    sourceLabel?: string | null;
    sourcePage?: number | null;
    sourceQuote?: string | null;
    sourceMaterialId?: string | null;
    sourceMaterialKind?: string | null;
    sourceTimestampSec?: number | null;
  };
}

// Map a source label (usually a file name) to the Sources icon family.
function inferSourceKind(label?: string | null): QuizSource['kind'] {
  const l = (label ?? '').trim().toLowerCase();
  if (l.endsWith('.pdf')) return 'pdf';
  if (l.endsWith('.ppt') || l.endsWith('.pptx') || l.endsWith('.key')) return 'ppt';
  if (l.endsWith('.doc') || l.endsWith('.docx')) return 'doc';
  return 'page';
}

// One sibling flashcard, surfaced as the Quick-recall self-check. The cards are
// generated from this exact theory, so the front primes the lesson the learner
// just read without needing a new recall schema (that's Phase D territory).
interface FlashcardContentPayload {
  kind: 'flashcards';
  flashcardSet: { cards: Array<{ question: string; answer: string }> };
}

// Mirrors the Figma mission rail (Theory · Quick Check · Practice · Complete).
const ACTIVITY_MISSION_LABEL: Record<string, string> = {
  theory: 'Theory',
  quiz: 'Quick Check',
  flashcards: 'Practice',
};

const SLOT_KIND_LABEL: Record<string, string> = {
  learning: 'Learning',
  review: 'Review',
  assessment: 'Checkpoint',
  final_exam: 'Final Exam',
};

interface CheckpointTheoryViewerProps {
  slot: PathSlot;
  activity: PathActivity;
  onClose: () => void;
  onCompleted: (unlocked?: PathUnlock[]) => void;
  /** Path id — Ask-Mage grounding + the Sources path chip. */
  planId?: string;
  /** The path's Study Pack notebook (kept for parity; unused by the shell). */
  notebookId?: string | null;
  /** Path title — the QuizPlayerShell breadcrumb root + Sources label. */
  pathTitle?: string;
}

export default function CheckpointTheoryViewer({
  slot,
  activity,
  onClose,
  onCompleted,
  planId,
  pathTitle,
}: CheckpointTheoryViewerProps) {
  const [theory, setTheory] = useState<TheoryContentPayload['theory'] | null>(null);
  const [recall, setRecall] = useState<{ question: string; answer: string } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { isDesktop } = useBreakpoint();
  const isPhone = !isDesktop;
  const mage = useOptionalMage();

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
          setLoadError(json?.error ?? 'Could not load theory.');
          return;
        }
        const payload = json.data as TheoryContentPayload;
        if (payload?.kind !== 'theory') {
          setLoadError('Unexpected activity content.');
          return;
        }
        setTheory(payload.theory);
      } catch {
        if (!cancelled) setLoadError('Network error. Try again.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activity.id]);

  // Quick-recall: lazily pull the slot's first sibling flashcard. Non-blocking —
  // theory renders regardless; the recall card just appears once the card loads.
  // Omitted gracefully when the slot has no flashcards (e.g. some sample slots).
  useEffect(() => {
    const flashActivity = slot.activities.find((a) => a.kind === 'flashcards');
    if (!flashActivity) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/learn/activities/${encodeURIComponent(flashActivity.id)}/content`,
        );
        const json = await res.json();
        if (cancelled || !json?.success) return;
        const payload = json.data as FlashcardContentPayload;
        const card = payload?.kind === 'flashcards' ? payload.flashcardSet.cards[0] : null;
        if (card?.question && card?.answer) {
          setRecall({ question: card.question, answer: card.answer });
        }
      } catch {
        // Recall is a bonus self-check — a failed fetch never blocks the lesson.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slot.activities]);

  const handleDone = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/learn/activities/${encodeURIComponent(activity.id)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ completed: true }),
        },
      );
      if (res.ok) {
        const json = await res.json().catch(() => null);
        onCompleted(readUnlocked(json));
      } else {
        setSubmitting(false);
      }
    } catch {
      setSubmitting(false);
    }
  }, [activity.id, submitting, onCompleted]);

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

  const breadcrumb = useMemo(
    () => (pathTitle ? [pathTitle, slot.title] : [slot.title]),
    [pathTitle, slot.title],
  );

  // Mission rail from the slot's activities + a terminal "Complete" step.
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

  // Step pill + header progress: "<label> · Step N of M" over the segment bar.
  const { stepLabel, progress } = useMemo(() => {
    const ordered = slot.activities.slice().sort((a, b) => a.sortOrder - b.sortOrder);
    const idx = ordered.findIndex((a) => a.id === activity.id);
    const label = ACTIVITY_MISSION_LABEL[activity.kind] ?? SLOT_KIND_LABEL[slot.kind] ?? 'Theory';
    const total = ordered.length + 1; // +1 for the terminal Complete step
    const current = idx >= 0 ? idx + 1 : 1;
    return {
      stepLabel: idx >= 0 ? `${label} · Step ${current} of ${total}` : label,
      progress: { current, total },
    };
  }, [slot.activities, slot.kind, activity.id, activity.kind]);

  // Sources — source-highlighting feature: when the lesson carries a grounding
  // anchor (sourceQuote present) surface that file/page/video with the passage to
  // highlight, so "Show source" opens the real source instead of Mage. Otherwise
  // fall back to the learning path itself (no passage → defers to Ask Mage).
  const sources = useMemo<QuizSource[]>(() => {
    if (theory?.sourceQuote) {
      const isVideo = theory.sourceTimestampSec != null;
      const materialKind =
        theory.sourceMaterialKind === 'page' || theory.sourceMaterialKind === 'document'
          ? theory.sourceMaterialKind
          : undefined;
      return [
        {
          id: `theory-${theory.id}`,
          title: theory.sourceLabel?.trim() || pathTitle || 'Source material',
          kind: isVideo ? 'video' : inferSourceKind(theory.sourceLabel),
          detail: theory.sourcePage != null ? `Page ${theory.sourcePage}` : undefined,
          quote: theory.sourceQuote,
          materialId: theory.sourceMaterialId ?? undefined,
          materialKind,
          page: theory.sourcePage ?? undefined,
          timestampSec: theory.sourceTimestampSec ?? undefined,
        },
      ];
    }
    return pathTitle
      ? [{ id: planId ?? slot.id, title: pathTitle, kind: 'path', detail: 'Learning path' }]
      : [];
  }, [theory, pathTitle, planId, slot.id]);

  // Net-new — register the surface so the floating Mage button grounds on the
  // on-screen lesson (mirrors CheckpointQuizViewer; `slot` is a required prop
  // so it's always available, no null-gating needed).
  useRegisterMageContext({
    type: 'lesson',
    ids: { pathId: planId, slotId: slot.id },
    title: slot.title,
  });

  const openMage = useCallback(() => {
    mage?.open({
      type: 'lesson',
      ids: { pathId: planId, slotId: slot.id },
      title: slot.title,
    });
  }, [mage, planId, slot.id, slot.title]);

  const mageActions = useMemo<MageQuickAction[]>(
    () => [
      { label: 'Explain simpler', onClick: openMage },
      { label: 'Give me an example', onClick: openMage },
      { label: 'Why does this matter?', onClick: openMage },
    ],
    [openMage],
  );

  return (
    <QuizPlayerShell
      breadcrumb={breadcrumb}
      title={slot.title}
      stepLabel={stepLabel}
      ariaLabel={`${slot.title} lesson`}
      session={null}
      progress={progress}
      sourcesNoun="lesson"
      customCard
      primaryCta={
        theory ? { label: submitting ? 'Saving…' : 'Continue', onClick: handleDone, disabled: submitting } : null
      }
      sources={sources}
      mission={mission}
      mageSubtitle="Stuck? Get it explained"
      mageActions={mageActions}
      onAskMage={openMage}
      onShowSource={openMage}
      onClose={onClose}
      bodyOnly={!!loadError || !theory}
    >
      {loadError ? (
        <p role="alert" style={{ color: 'var(--error)', fontSize: '14px' }}>
          {loadError}
        </p>
      ) : !theory ? (
        <CheckpointSkeletonBody kind="theory" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: isPhone ? '12px' : '16px' }}>
          <TheoryActivityCard
            body={theory.body}
            theoryId={theory.id}
            source={sources[0]}
            isPhone={isPhone}
            onAskMage={openMage}
          />
          {recall ? <QuickRecall question={recall.question} answer={recall.answer} /> : null}
        </div>
      )}
    </QuizPlayerShell>
  );
}
