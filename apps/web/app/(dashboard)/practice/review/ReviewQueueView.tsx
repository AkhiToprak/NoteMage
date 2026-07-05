'use client';

/* Hallmark · component: review queue view · genre: editorial · theme: project (cream / --quiz-* + --nm-* tokens)
 * states: empty · in-progress (flip → grade → advance) · completing · done · retry
 * contrast: pass (semantic tokens only, reuses QuizPlayerShell + FlashcardActivityCard + GradeButtonRow)
 *
 * Weakness Training Phase 4.3c (plans/weakness-training-phase4.md §13.7,
 * §13.8) — the schedule-driven due-card queue surface. Thin client: the
 * queue arrives pre-fetched from the server component (no client fetch on
 * mount), the learner flips → grades each card (accumulated in state, same
 * pattern as `CheckpointFlashcardViewer`'s review-slot grading), and ONE
 * batch POST to `/api/flashcards/review-sessions` fires when the deck is
 * exhausted. Deliberately NOT folded into Weak Spots — this is schedule-
 * driven (SM-2 due dates), not diagnosis-driven. No new sidebar slot.
 */

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { useCoarsePointer } from '@/hooks/useCoarsePointer';
import QuizPlayerShell from '@/components/quiz/player/QuizPlayerShell';
import FlashcardActivityCard from '@/components/quiz/player/FlashcardActivityCard';
import GradeButtonRow, { type ReviewQuality } from '@/components/quiz/player/GradeButtonRow';
import type { MageQuickAction, QuizSource } from '@/components/quiz/player/types';
import { useOptionalMage } from '@/components/mage/MageProvider';
import { useRegisterMageContext } from '@/components/mage';
import { buildFlashcardActivityContext } from '@/lib/mage-types';
import ui from '@/components/app/ui.module.css';
import AppShell from '@/components/app/AppShell';
import type { ReviewQueue, ReviewQueueCard } from '@/lib/flashcard-review-queue';

interface ReviewGrade {
  cardId: string;
  quality: ReviewQuality;
}

async function postReviewGrades(setId: string, grades: ReviewGrade[]): Promise<boolean> {
  try {
    const res = await fetch('/api/flashcards/review-sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ setId, grades }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Grades are batched at session end (plan §13.6), but the queue mixes cards
 * from multiple sets (cross-deck is the point, §13.6 "GET assembles across
 * ALL the user's sets"). The batch route takes one `setId` per POST, so
 * grades are grouped by their card's `setId` and one POST fires per group —
 * still "one batch POST" per set, never per-card, and all groups fire
 * concurrently so a multi-set session doesn't serialize round-trips.
 */
async function submitGradesBySet(
  cards: ReviewQueueCard[],
  grades: Map<string, ReviewQuality>,
): Promise<boolean> {
  const cardById = new Map(cards.map((c) => [c.id, c]));
  const bySet = new Map<string, ReviewGrade[]>();
  for (const [cardId, quality] of grades) {
    const setId = cardById.get(cardId)?.setId;
    if (!setId) continue;
    const list = bySet.get(setId) ?? [];
    list.push({ cardId, quality });
    bySet.set(setId, list);
  }
  if (bySet.size === 0) return true;
  const results = await Promise.all(
    [...bySet.entries()].map(([setId, setGrades]) => postReviewGrades(setId, setGrades)),
  );
  return results.every(Boolean);
}

export default function ReviewQueueView({ queue }: { queue: ReviewQueue }) {
  if (queue.cards.length === 0) {
    return <EmptyState dueCount={queue.dueCount} newCount={queue.newCount} />;
  }
  return <ReviewSession queue={queue} />;
}

function EmptyState({ dueCount, newCount }: { dueCount: number; newCount: number }) {
  // dueCount/newCount are 0 here in the common case (nothing due at all), but
  // could theoretically be non-zero if the cap trimmed the fetched batch to 0
  // cards — kept for a defensively accurate empty message either way.
  const stillWaiting = dueCount + newCount > 0;
  return (
    <AppShell width="narrow">
      <div className={ui.header}>
        <div>
          <h1 className={ui.h1}>Review</h1>
          <p className={ui.sub}>Spaced-repetition flashcard queue</p>
        </div>
      </div>
      <div className={ui.card} style={{ marginTop: 24, padding: '52px 32px', textAlign: 'center' }}>
        <span
          className="material-symbols-outlined"
          aria-hidden
          style={{ fontSize: 40, color: 'var(--muted)', display: 'block', marginBottom: 12 }}
        >
          check_circle
        </span>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>No cards due.</div>
        <p style={{ marginTop: 6, fontSize: 14, color: 'var(--body)' }}>
          {stillWaiting
            ? 'More cards are waiting behind today’s cap — come back tomorrow.'
            : 'Cards land here as your decks come due for review. Check back after your next study session.'}
        </p>
        <Link href="/dashboard" className={`${ui.btn} ${ui.primary}`} style={{ marginTop: 18 }}>
          Back to dashboard
        </Link>
      </div>
    </AppShell>
  );
}

function ReviewSession({ queue }: { queue: ReviewQueue }) {
  const { cards } = queue;
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [grades, setGrades] = useState<Map<string, ReviewQuality>>(new Map());
  const [phase, setPhase] = useState<'active' | 'submitting' | 'done' | 'error'>('active');
  const { isDesktop } = useBreakpoint();
  const isPhone = !isDesktop;
  const coarsePointer = useCoarsePointer();
  const router = useRouter();
  const mage = useOptionalMage();

  const total = cards.length;
  const card = cards[currentIndex];
  const isLast = currentIndex === total - 1;

  const finish = useCallback(
    async (finalGrades: Map<string, ReviewQuality>) => {
      setPhase('submitting');
      const ok = await submitGradesBySet(cards, finalGrades);
      setPhase(ok ? 'done' : 'error');
    },
    [cards],
  );

  const gradeCurrentCard = useCallback(
    (quality: ReviewQuality) => {
      if (!card) return;
      setGrades((prev) => {
        const next = new Map(prev);
        next.set(card.id, quality);
        if (isLast) {
          void finish(next);
        } else {
          setCurrentIndex((i) => i + 1);
          setIsFlipped(false);
        }
        return next;
      });
    },
    [card, isLast, finish],
  );

  const retry = useCallback(() => {
    void finish(grades);
  }, [finish, grades]);

  const flip = useCallback(() => setIsFlipped((v) => !v), []);
  const close = useCallback(() => router.push('/dashboard'), [router]);

  const sources = useMemo<QuizSource[]>(() => [], []);

  // First Mage entry point for the review queue (P3): ground on the current
  // card. Cross-deck queue → no single owning path/set id, so `ids: {}` and let
  // activityContext carry the grounding. Pre-flip the back rides in `revealing`
  // (stripped server-side under the practice gate); post-flip it moves to `safe`.
  const flashcardContext = useMemo(
    () =>
      card
        ? buildFlashcardActivityContext(
            { front: card.question, back: card.answer, imageCaptions: card.images.map((i) => i.caption) },
            {
              deckTitle: card.setTitle,
              position: currentIndex + 1,
              total,
              isFlipped,
              lastGrade: grades.get(card.id) != null ? String(grades.get(card.id)) : null,
            },
          )
        : null,
    [card, currentIndex, total, isFlipped, grades],
  );

  useRegisterMageContext(
    card && flashcardContext
      ? {
          type: 'practice',
          ids: {},
          title: card.setTitle,
          activeQuestionId: card.id,
          activityContext: flashcardContext.safe,
          activityRevealing: flashcardContext.revealing,
        }
      : null,
  );

  const openMage = useCallback(() => {
    mage?.open({
      type: 'practice',
      ids: {},
      title: card?.setTitle ?? 'Review queue',
      activeQuestionId: card?.id,
      activityContext: flashcardContext?.safe,
      activityRevealing: flashcardContext?.revealing,
    });
  }, [mage, card?.setTitle, card?.id, flashcardContext]);

  const mageActions = useMemo<MageQuickAction[]>(
    () => [
      { label: 'Explain this card', onClick: openMage },
      { label: 'Give me a hint', onClick: openMage },
      { label: 'Why does this matter?', onClick: openMage },
    ],
    [openMage],
  );

  if (phase === 'done') {
    return <CompletionState gradedCount={grades.size} totalCount={total} />;
  }

  const stepLabel = `Review · Card ${currentIndex + 1} of ${total}`;
  const showGradeRow = phase === 'active' && isFlipped;

  return (
    <QuizPlayerShell
      breadcrumb={['Review']}
      title="Review queue"
      stepLabel={stepLabel}
      ariaLabel="Flashcard review queue"
      session={null}
      progress={{ current: currentIndex + 1, total }}
      sourcesNoun="card"
      customCard
      primaryCta={
        !showGradeRow
          ? !isFlipped
            ? { label: 'Show answer', onClick: flip, disabled: phase !== 'active' }
            : null
          : null
      }
      secondaryActions={[]}
      sources={sources}
      mission={[]}
      hideMission
      mageSubtitle="Stuck on a card?"
      mageActions={mageActions}
      onAskMage={openMage}
      onClose={close}
    >
      {phase === 'error' ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px',
            padding: '32px 0',
            textAlign: 'center',
          }}
        >
          <p style={{ color: 'var(--error)', fontSize: '14px', margin: 0 }}>
            Couldn&apos;t save your grades. Your progress is kept — try again.
          </p>
          <button
            type="button"
            onClick={retry}
            className="qs-btn qs-cta"
            style={{
              padding: '12px 28px',
              borderRadius: 'var(--radius-full)',
              border: 'none',
              background: 'var(--accent-strong)',
              color: 'var(--on-primary-container)',
              fontSize: '15px',
              fontWeight: 800,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Retry
          </button>
        </div>
      ) : card ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: isPhone ? '12px' : '16px' }}>
          <FlashcardActivityCard
            card={card}
            isFlipped={isFlipped}
            onFlip={flip}
            isPhone={isPhone}
            coarsePointer={coarsePointer}
          />
          {showGradeRow ? (
            <GradeButtonRow onGrade={gradeCurrentCard} disabled={phase !== 'active'} isPhone={isPhone} />
          ) : null}
        </div>
      ) : null}
    </QuizPlayerShell>
  );
}

function CompletionState({ gradedCount, totalCount }: { gradedCount: number; totalCount: number }) {
  return (
    <AppShell width="narrow">
      <div className={ui.header}>
        <div>
          <h1 className={ui.h1}>Review</h1>
          <p className={ui.sub}>Session complete</p>
        </div>
      </div>
      <div className={ui.card} style={{ marginTop: 24, padding: '52px 32px', textAlign: 'center' }}>
        <span
          className="material-symbols-outlined"
          aria-hidden
          style={{ fontSize: 40, color: 'var(--accent)', display: 'block', marginBottom: 12 }}
        >
          check_circle
        </span>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>
          Done. {gradedCount} {gradedCount === 1 ? 'card' : 'cards'} reviewed.
        </div>
        {totalCount !== gradedCount ? (
          <p style={{ marginTop: 6, fontSize: 14, color: 'var(--body)' }}>
            {totalCount} in this session
          </p>
        ) : null}
        <Link href="/dashboard" className={`${ui.btn} ${ui.primary}`} style={{ marginTop: 18 }}>
          Back to dashboard
        </Link>
      </div>
    </AppShell>
  );
}
