'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import DiagramReferencePanel from '@/components/learn/DiagramReferencePanel';
import QuizPlayerShell, { type ShellSecondaryAction } from '@/components/quiz/player/QuizPlayerShell';
import FlashcardActivityCard from '@/components/quiz/player/FlashcardActivityCard';
import GradeButtonRow, { type ReviewQuality } from '@/components/quiz/player/GradeButtonRow';
import { useOptionalMage } from '@/components/mage/MageProvider';
import { useRegisterMageContext } from '@/components/mage';
import { buildFlashcardActivityContext } from '@/lib/mage-types';
import type { MageQuickAction, QuizSource } from '@/components/quiz/player/types';
import { useCoarsePointer } from '@/hooks/useCoarsePointer';
import type { PathActivity, PathSlot } from '@/components/learn/PathView';
import { readUnlocked, type PathUnlock } from '@/components/learn/path-rewards';
import { CheckpointSkeletonBody } from '@/components/learn/CheckpointSkeleton';
import { trackEvent } from '@/lib/telemetry';

// Weakness Training Phase 4.3b (plans/weakness-training-phase4.md §13.1/13.7)
// — self-grading is opt-in per surface. `slot.kind === 'review'` is the only
// gate for the 4-button row; LEARNING-kind checkpoints and standalone Study
// Pack decks (no slot at all) stay ungraded flip-through. `GradeButtonRow`
// (Phase 4.3c) lives in components/quiz/player so both this viewer and the
// standalone `/practice/review` queue render byte-identical buttons.

interface ReviewGrade {
  cardId: string;
  quality: ReviewQuality;
}

async function postReviewSessionGrades(setId: string, grades: ReviewGrade[]): Promise<void> {
  if (grades.length === 0) return;
  await fetch('/api/flashcards/review-sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ setId, grades }),
  });
}

async function postSeedOnly(cardIds: string[]): Promise<void> {
  if (cardIds.length === 0) return;
  await fetch('/api/flashcards/review-sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ seedOnly: true, cardIds }),
  });
}

// Map a source label (usually a file name) to the Sources icon family.
function inferSourceKind(label?: string | null): QuizSource['kind'] {
  const l = (label ?? '').trim().toLowerCase();
  if (l.endsWith('.pdf')) return 'pdf';
  if (l.endsWith('.ppt') || l.endsWith('.pptx') || l.endsWith('.key')) return 'ppt';
  if (l.endsWith('.doc') || l.endsWith('.docx')) return 'doc';
  return 'page';
}

// Full-screen viewer for checkpoint flashcards. Phase (Quiz screens redesign):
// the deck now rides the same warm-cream QuizPlayerShell as quizzes + theory
// (header breadcrumb · step pill · Sources / Ask Mage / Mission sidebar · sticky
// action bar) instead of the old bare dark overlay. The learner flips through
// cards — the action-bar CTA reveals the answer, advances ("Next card"), then
// completes ("Done") on the last card, mirroring the quiz Check → Continue →
// Finish flow. Content fetch + "mark complete" PATCH are unchanged.

interface FlashcardImageData {
  id: string;
  side: string;
  fileName: string;
  filePath: string;
  mimeType: string;
  // Slot-local caption for path-generated figures (P3). Null/absent for
  // manually-uploaded images, which render without a caption.
  caption?: string | null;
  sortOrder: number;
}

interface Flashcard {
  id: string;
  question: string;
  answer: string;
  sortOrder: number;
  images?: FlashcardImageData[];
  // Source-highlighting feature — per-card grounding anchor. Present → a "Show
  // source" control opens the reader drawer on the origin material.
  sourceLabel?: string | null;
  sourcePage?: number | null;
  sourceQuote?: string | null;
  sourceMaterialId?: string | null;
  sourceMaterialKind?: string | null;
  sourceTimestampSec?: number | null;
}

interface FlashcardSetPayload {
  kind: 'flashcards';
  flashcardSet: {
    id: string;
    notebookId: string | null;
    title: string;
    cards: Flashcard[];
    // Path-diagrams revival (Phase 3): set-level reference diagrams (loose JSON,
    // validated client-side by DiagramReferencePanel). Null when none apply.
    diagrams?: unknown;
  };
}

interface CheckpointFlashcardViewerProps {
  slot?: PathSlot;
  activity?: PathActivity;
  onClose: () => void;
  onCompleted?: (unlocked?: PathUnlock[]) => void;
  /** Path id — Ask-Mage grounding + the Sources path chip. */
  planId?: string;
  /** Path title — the QuizPlayerShell breadcrumb root + Sources label. */
  pathTitle?: string;
  // Standalone (Study Pack) mode: render the deck directly from a pre-fetched
  // set, with no path slot/activity — no content fetch, no completion PATCH, no
  // path telemetry. The "Done" button simply closes the viewer.
  standalone?: {
    title: string;
    cards: Flashcard[];
    diagrams?: unknown;
  };
}

export default function CheckpointFlashcardViewer({
  slot,
  activity,
  onClose,
  onCompleted,
  planId,
  pathTitle,
  standalone,
}: CheckpointFlashcardViewerProps) {
  const [cards, setCards] = useState<Flashcard[] | null>(standalone?.cards ?? null);
  const [diagrams, setDiagrams] = useState<unknown>(standalone?.diagrams ?? null);

  const titleText = slot?.title ?? standalone?.title ?? 'Flashcards';
  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { isDesktop } = useBreakpoint();
  const isPhone = !isDesktop;
  const coarsePointer = useCoarsePointer();
  const mage = useOptionalMage();

  // Weakness Training Phase 4.3b — grading is opt-in per surface (plan
  // §13.7): only a path checkpoint whose slot is a REVIEW slot shows the
  // 4-button row. Standalone (Study Pack) decks and LEARNING/ASSESSMENT
  // checkpoints stay the original flip-through.
  const isReviewSlot = slot?.kind === 'review';
  const [grades, setGrades] = useState<Map<string, ReviewQuality>>(new Map());

  useEffect(() => {
    if (!slot || !activity) return;
    trackEvent('path.activity.opened', {
      slotId: slot.id,
      slotKind: slot.kind,
      activityId: activity.id,
      activityKind: activity.kind,
    });
  }, [slot, activity]);

  useEffect(() => {
    // Standalone mode seeds cards from props — no content fetch.
    if (standalone || !activity) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/learn/activities/${encodeURIComponent(activity.id)}/content`,
        );
        const json = await res.json();
        if (cancelled) return;
        if (!json?.success) {
          setLoadError(json?.error ?? 'Could not load flashcards.');
          return;
        }
        const payload = json.data as FlashcardSetPayload;
        if (payload?.kind !== 'flashcards') {
          setLoadError('Unexpected activity content.');
          return;
        }
        setCards(payload.flashcardSet.cards ?? []);
        setDiagrams(payload.flashcardSet.diagrams ?? null);
      } catch {
        if (!cancelled) setLoadError('Network error. Try again.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activity?.id, standalone]);

  const total = cards?.length ?? 0;
  const card = cards?.[currentIndex];
  const isLast = total > 0 && currentIndex === total - 1;

  // Source-highlighting — the current card's grounding anchor (when present)
  // drives the shell's Sources panel + "Show source" reader drawer.
  const cardSource = useMemo<QuizSource | undefined>(() => {
    if (!card?.sourceQuote) return undefined;
    const isVideo = card.sourceTimestampSec != null;
    const materialKind =
      card.sourceMaterialKind === 'page' || card.sourceMaterialKind === 'document'
        ? card.sourceMaterialKind
        : undefined;
    return {
      id: `card-${card.id}`,
      title: card.sourceLabel?.trim() || titleText || 'Source material',
      kind: isVideo ? 'video' : inferSourceKind(card.sourceLabel),
      detail: card.sourcePage != null ? `Page ${card.sourcePage}` : undefined,
      quote: card.sourceQuote,
      materialId: card.sourceMaterialId ?? undefined,
      materialKind,
      page: card.sourcePage ?? undefined,
      timestampSec: card.sourceTimestampSec ?? undefined,
    };
  }, [card, titleText]);

  const flip = useCallback(() => setIsFlipped((v) => !v), []);

  const next = useCallback(() => {
    setCurrentIndex((i) => {
      if (i >= total - 1) return i;
      setIsFlipped(false);
      return i + 1;
    });
  }, [total]);

  const prev = useCallback(() => {
    setCurrentIndex((i) => {
      if (i <= 0) return i;
      setIsFlipped(false);
      return i - 1;
    });
  }, []);

  // Review-slot grading: record the button choice for the current card, then
  // advance/finish exactly like the plain flip-through's next()/handleDone().
  // Grades accumulate client-side (plan §13.7 — "batch at session end") and
  // are POSTed once the deck completes, fired alongside (not blocking on)
  // the completion PATCH below.
  const gradeCurrentCard = useCallback(
    (quality: ReviewQuality) => {
      if (!card) return;
      setGrades((prevGrades) => {
        const nextGrades = new Map(prevGrades);
        nextGrades.set(card.id, quality);
        return nextGrades;
      });
      if (isLast) {
        void handleDoneRef.current?.();
      } else {
        next();
      }
    },
    [card, isLast, next],
  );

  const handleDone = useCallback(async () => {
    if (submitting) return;
    // Standalone (Study Pack): no path activity to complete — just close.
    if (standalone || !activity) {
      onClose();
      return;
    }
    setSubmitting(true);

    // Fire grading/seeding best-effort, alongside the completion PATCH —
    // never let a grading failure block marking the checkpoint complete.
    const setId = activity.flashcardSetId;
    if (isReviewSlot && setId && grades.size > 0) {
      const payload = Array.from(grades.entries()).map(([cardId, quality]) => ({ cardId, quality }));
      postReviewSessionGrades(setId, payload).catch(() => {});
    } else if (!isReviewSlot && slot?.kind === 'learning' && cards && cards.length > 0) {
      // Passive seeding (plan §13.7): a LEARNING-kind deck seeds its
      // never-reviewed cards to tomorrow so they enter the review queue
      // without a premature self-grade. Fire-and-forget, best-effort.
      postSeedOnly(cards.map((c) => c.id)).catch(() => {});
    }

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
        onCompleted?.(readUnlocked(json));
      } else {
        setSubmitting(false);
      }
    } catch {
      setSubmitting(false);
    }
  }, [activity, submitting, onCompleted, standalone, onClose, isReviewSlot, grades, slot?.kind, cards]);

  // handleDone is defined after gradeCurrentCard needs to call it (last-card
  // grade = finish); a ref sidesteps the circular dependency without
  // reordering the hooks above.
  const handleDoneRef = useRef(handleDone);
  useEffect(() => {
    handleDoneRef.current = handleDone;
  }, [handleDone]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.code === 'Space') {
        // Let Space activate a focused button/link (e.g. the action-bar CTA or
        // "Previous"); only flip the card when focus is elsewhere.
        if (target && (target.tagName === 'BUTTON' || target.tagName === 'A')) return;
        e.preventDefault();
        flip();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        prev();
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        next();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose, flip, prev, next]);

  const breadcrumb = useMemo(
    () => (slot ? (pathTitle ? [pathTitle, slot.title] : [slot.title]) : [titleText]),
    [slot, pathTitle, titleText],
  );

  // Step pill + header progress reflect deck position (Card N of M), mirroring
  // how the quiz shell counts questions.
  const stepLabel = total > 0 ? `Practice · Card ${currentIndex + 1} of ${total}` : 'Practice';
  const progress = total > 0 ? { current: currentIndex + 1, total } : undefined;

  // Sources — the current card's grounding anchor when present, else the path.
  const sources = useMemo<QuizSource[]>(() => {
    if (cardSource) return [cardSource];
    if (pathTitle) {
      return [{ id: planId ?? slot?.id ?? 'path', title: pathTitle, kind: 'path', detail: 'Learning path' }];
    }
    return [];
  }, [cardSource, pathTitle, planId, slot?.id]);

  // Net-new (P3): ground Mage on the current card. Pre-flip the back rides in
  // `revealing` (server strips it under the practice/hint_only gate); post-flip
  // it moves into `safe`. Built inline so registration re-keys as cards flip.
  const flashcardContext = useMemo(
    () =>
      card
        ? buildFlashcardActivityContext(
            { front: card.question, back: card.answer, imageCaptions: card.images?.map((i) => i.caption ?? null) },
            {
              deckTitle: titleText,
              position: currentIndex + 1,
              total,
              isFlipped,
              lastGrade: grades.get(card.id) != null ? String(grades.get(card.id)) : null,
            },
          )
        : null,
    [card, titleText, currentIndex, total, isFlipped, grades],
  );

  useRegisterMageContext(
    cards && card && flashcardContext
      ? {
          type: 'practice',
          ids: { pathId: planId, slotId: slot?.id },
          title: slot?.title ?? titleText,
          activeQuestionId: card.id,
          activityContext: flashcardContext.safe,
          activityRevealing: flashcardContext.revealing,
        }
      : null,
  );

  const openMage = useCallback(() => {
    mage?.open({
      type: 'practice',
      ids: { pathId: planId, slotId: slot?.id },
      title: slot?.title ?? titleText,
      activeQuestionId: card?.id,
      activityContext: flashcardContext?.safe,
      activityRevealing: flashcardContext?.revealing,
    });
  }, [mage, planId, slot?.id, slot?.title, titleText, card?.id, flashcardContext]);

  const mageActions = useMemo<MageQuickAction[]>(
    () => [
      { label: 'Explain this card', onClick: openMage },
      { label: 'Give me a hint', onClick: openMage },
      { label: 'Why does this matter?', onClick: openMage },
    ],
    [openMage],
  );

  // Deck navigation lives in the action bar; Ask Mage / Sources stay in the
  // sidebar (so the footer reads Previous · CTA, not a cluttered pill row).
  const secondaryActions = useMemo<ShellSecondaryAction[]>(
    () =>
      total > 0
        ? [{ icon: 'arrow_back', label: 'Previous', onClick: prev, disabled: currentIndex === 0 }]
        : [],
    [total, prev, currentIndex],
  );

  // Review-slot grading (plan §13.1): once flipped, the 4-button grade row
  // (rendered below the card) REPLACES the shell's single CTA — grading a
  // card both records the choice and advances/finishes, so there's nothing
  // left for the footer CTA to do.
  const showGradeRow = isReviewSlot && total > 0 && isFlipped;

  // CTA mirrors the quiz Check → Continue → Finish flow: reveal the answer,
  // advance, then complete on the last card. Non-review decks are unchanged;
  // review decks keep "Show answer" pre-flip, then hand off to the grade row.
  const cta =
    total > 0 && !showGradeRow
      ? !isFlipped
        ? { label: 'Show answer', onClick: flip, disabled: submitting }
        : isLast
          ? { label: submitting ? 'Saving…' : 'Done', onClick: handleDone, disabled: submitting }
          : { label: 'Next card', onClick: next, disabled: submitting }
      : null;

  const bodyOnly = !!loadError || !cards || total === 0;

  return (
    <QuizPlayerShell
      breadcrumb={breadcrumb}
      title={titleText}
      stepLabel={stepLabel}
      ariaLabel={`${titleText} flashcards`}
      session={null}
      progress={progress}
      sourcesNoun="card"
      customCard
      primaryCta={cta}
      secondaryActions={secondaryActions}
      sources={sources}
      mission={[]}
      hideMission
      mageSubtitle="Stuck on a card?"
      mageActions={mageActions}
      onAskMage={openMage}
      onShowSource={openMage}
      onClose={onClose}
      bodyOnly={bodyOnly}
    >
      {loadError ? (
        <p role="alert" style={{ color: 'var(--error)', fontSize: '14px' }}>
          {loadError}
        </p>
      ) : !cards ? (
        <CheckpointSkeletonBody kind="flashcards" />
      ) : total === 0 ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '16px',
            padding: '40px 0',
            textAlign: 'center',
          }}
        >
          <p style={{ color: 'var(--on-surface-variant)', fontSize: '14px', margin: 0 }}>
            No flashcards in this checkpoint.
          </p>
          <button
            type="button"
            onClick={handleDone}
            disabled={submitting}
            className="qs-btn qs-cta"
            style={{
              padding: '12px 28px',
              minWidth: '160px',
              borderRadius: 'var(--radius-full)',
              border: 'none',
              background: 'var(--accent-strong)',
              color: 'var(--on-primary-container)',
              fontSize: '15px',
              fontWeight: 800,
              cursor: submitting ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {submitting ? 'Saving…' : 'Done'}
          </button>
        </div>
      ) : card ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: isPhone ? '12px' : '16px' }}>
          <DiagramReferencePanel diagrams={diagrams} />
          <FlashcardActivityCard
            card={card}
            isFlipped={isFlipped}
            onFlip={flip}
            isPhone={isPhone}
            coarsePointer={coarsePointer}
          />
          {showGradeRow ? (
            <GradeButtonRow onGrade={gradeCurrentCard} disabled={submitting} isPhone={isPhone} />
          ) : null}
        </div>
      ) : null}
    </QuizPlayerShell>
  );
}
