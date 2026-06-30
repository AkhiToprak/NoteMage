'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import DiagramReferencePanel from '@/components/learn/DiagramReferencePanel';
import QuizPlayerShell, { type ShellSecondaryAction } from '@/components/quiz/player/QuizPlayerShell';
import FlashcardActivityCard from '@/components/quiz/player/FlashcardActivityCard';
import { useOptionalMage } from '@/components/mage/MageProvider';
import type { MageQuickAction, QuizSource } from '@/components/quiz/player/types';
import { useCoarsePointer } from '@/hooks/useCoarsePointer';
import type { PathActivity, PathSlot } from '@/components/learn/PathView';
import { readUnlocked, type PathUnlock } from '@/components/learn/path-rewards';
import { CheckpointSkeletonBody } from '@/components/learn/CheckpointSkeleton';
import { trackEvent } from '@/lib/telemetry';

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

  const handleDone = useCallback(async () => {
    if (submitting) return;
    // Standalone (Study Pack): no path activity to complete — just close.
    if (standalone || !activity) {
      onClose();
      return;
    }
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
        onCompleted?.(readUnlocked(json));
      } else {
        setSubmitting(false);
      }
    } catch {
      setSubmitting(false);
    }
  }, [activity, submitting, onCompleted, standalone, onClose]);

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

  const openMage = useCallback(() => {
    mage?.open({
      type: 'practice',
      ids: { pathId: planId, slotId: slot?.id },
      title: slot?.title ?? titleText,
    });
  }, [mage, planId, slot?.id, slot?.title, titleText]);

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

  // CTA mirrors the quiz Check → Continue → Finish flow: reveal the answer,
  // advance, then complete on the last card.
  const cta =
    total > 0
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
        </div>
      ) : null}
    </QuizPlayerShell>
  );
}
