'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import MarkdownRenderer from '@/components/ui/MarkdownRenderer';
import type { PathActivity, PathSlot } from '@/components/learn/PathView';
import { trackEvent } from '@/lib/telemetry';

// Full-screen viewer for checkpoint flashcards. Replaces the in-drawer
// FlashcardViewer for path checkpoints — no edit / delete / SRS rating /
// CSV / section-picker / image-upload UI. The learner flips through
// cards and presses Done on the last one to mark the activity complete.

interface FlashcardImageData {
  id: string;
  side: string;
  fileName: string;
  filePath: string;
  mimeType: string;
  sortOrder: number;
}

interface Flashcard {
  id: string;
  question: string;
  answer: string;
  sortOrder: number;
  images?: FlashcardImageData[];
}

interface FlashcardSetPayload {
  kind: 'flashcards';
  flashcardSet: {
    id: string;
    notebookId: string | null;
    title: string;
    cards: Flashcard[];
  };
}

const SLOT_KIND_LABEL: Record<string, string> = {
  learning: 'Learning',
  review: 'Review',
  assessment: 'Checkpoint',
};

interface CheckpointFlashcardViewerProps {
  slot: PathSlot;
  activity: PathActivity;
  onClose: () => void;
  onCompleted: () => void;
}

export default function CheckpointFlashcardViewer({
  slot,
  activity,
  onClose,
  onCompleted,
}: CheckpointFlashcardViewerProps) {
  const [cards, setCards] = useState<Flashcard[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

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
          setLoadError(json?.error ?? 'Could not load flashcards.');
          return;
        }
        const payload = json.data as FlashcardSetPayload;
        if (payload?.kind !== 'flashcards') {
          setLoadError('Unexpected activity content.');
          return;
        }
        setCards(payload.flashcardSet.cards ?? []);
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

  const total = cards?.length ?? 0;
  const card = cards?.[currentIndex];
  const isLast = total > 0 && currentIndex === total - 1;

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
        onCompleted();
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
      } else if (e.code === 'Space') {
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

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-label={`${slot.title} flashcards`}
      tabIndex={-1}
      className="checkpoint-flashcards"
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
        .checkpoint-flashcards {
          animation: fcOverlayIn 0.22s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        @keyframes fcOverlayIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          .checkpoint-flashcards { animation: none; }
          .checkpoint-flashcards .fc-flip-card { transition: none !important; }
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
        {total > 0 && (
          <span
            aria-label={`Card ${currentIndex + 1} of ${total}`}
            style={{
              display: 'inline-flex',
              alignItems: 'baseline',
              gap: '4px',
              padding: '6px 12px',
              borderRadius: 'var(--radius-full)',
              border: '1px solid var(--outline-variant)',
              background: 'var(--surface-container)',
              color: 'var(--on-surface-variant)',
              fontSize: '12px',
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: '0.04em',
              flexShrink: 0,
            }}
          >
            <span style={{ color: 'var(--on-surface)', fontWeight: 700 }}>
              {currentIndex + 1}
            </span>
            <span>/</span>
            <span>{total}</span>
          </span>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close flashcards"
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
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px 16px',
          overflow: 'hidden',
          minHeight: 0,
        }}
      >
        {loadError ? (
          <p role="alert" style={{ color: 'var(--error)', fontSize: '14px' }}>
            {loadError}
          </p>
        ) : !cards ? (
          <p style={{ color: 'var(--on-surface-variant)', fontSize: '14px' }}>
            Loading flashcards…
          </p>
        ) : total === 0 ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '16px',
            }}
          >
            <p style={{ color: 'var(--on-surface-variant)', fontSize: '14px' }}>
              No flashcards in this checkpoint.
            </p>
            <button
              type="button"
              onClick={handleDone}
              disabled={submitting}
              style={{ ...primaryBtnStyle, opacity: submitting ? 0.6 : 1 }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
                check
              </span>
              {submitting ? 'Saving…' : 'Done'}
            </button>
          </div>
        ) : card ? (
          <div
            style={{
              width: '100%',
              maxWidth: '640px',
              height: 'min(72vh, 620px)',
              perspective: '1200px',
            }}
          >
            <div
              className="fc-flip-card"
              onClick={flip}
              role="button"
              tabIndex={0}
              aria-label={isFlipped ? 'Show question' : 'Show answer'}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  flip();
                }
              }}
              style={{
                width: '100%',
                height: '100%',
                position: 'relative',
                transformStyle: 'preserve-3d',
                transition: 'transform 0.55s cubic-bezier(0.22, 1, 0.36, 1)',
                transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
                cursor: 'pointer',
              }}
            >
              <CardFace side="front" card={card} />
              <CardFace side="back" card={card} />
            </div>
          </div>
        ) : null}
      </div>

      {cards && total > 0 ? (
        <footer
          style={{
            padding: '14px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            borderTop: '1px solid var(--outline-variant)',
            background: 'var(--surface-container-low)',
          }}
        >
          <button
            type="button"
            onClick={prev}
            disabled={currentIndex === 0}
            aria-label="Previous card"
            style={navBtnStyle(currentIndex === 0)}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '24px' }}>
              chevron_left
            </span>
          </button>
          <button
            type="button"
            onClick={flip}
            style={{ ...ghostBtnStyle, minWidth: '140px' }}
          >
            {isFlipped ? 'Show question' : 'Flip card'}
          </button>
          {isLast ? (
            <button
              type="button"
              onClick={handleDone}
              disabled={submitting}
              style={{ ...primaryBtnStyle, opacity: submitting ? 0.6 : 1 }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
                check
              </span>
              {submitting ? 'Saving…' : 'Done'}
            </button>
          ) : (
            <button
              type="button"
              onClick={next}
              aria-label="Next card"
              style={navBtnStyle(false)}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '24px' }}>
                chevron_right
              </span>
            </button>
          )}
        </footer>
      ) : null}
    </div>
  );
}

function CardFace({ side, card }: { side: 'front' | 'back'; card: Flashcard }) {
  const isFront = side === 'front';
  const text = isFront ? card.question : card.answer;
  const images = card.images?.filter((img) => img.side === side) ?? [];
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        backfaceVisibility: 'hidden',
        WebkitBackfaceVisibility: 'hidden',
        borderRadius: 'var(--radius-lg)',
        background: 'var(--surface-container)',
        border: '1px solid var(--outline-variant)',
        color: 'var(--on-surface)',
        padding: 'clamp(24px, 5vw, 56px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '16px',
        textAlign: 'center',
        overflow: 'auto',
        transform: isFront ? undefined : 'rotateY(180deg)',
        boxShadow:
          '0 8px 32px rgba(174,137,255,0.06), 0 2px 8px rgba(0,0,0,0.3)',
      }}
    >
      <span
        style={{
          fontSize: '11px',
          color: 'var(--on-surface-variant)',
          textTransform: 'uppercase',
          letterSpacing: '0.14em',
          fontWeight: 700,
        }}
      >
        {isFront ? 'Question' : 'Answer'}
      </span>
      <div
        style={{
          fontSize: 'clamp(18px, 2.4vw, 22px)',
          lineHeight: 1.55,
          maxWidth: '100%',
          wordBreak: 'break-word',
        }}
      >
        <MarkdownRenderer content={text} />
      </div>
      {images.length > 0 ? (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px',
            justifyContent: 'center',
            maxWidth: '100%',
          }}
        >
          {images.map((img) => (
            <img
              key={img.id}
              src={`/api/uploads/flashcard-images/${img.id}`}
              alt={img.fileName}
              style={{
                maxWidth: '100%',
                maxHeight: '220px',
                borderRadius: 'var(--radius-md)',
                objectFit: 'contain',
                border: '1px solid var(--outline-variant)',
              }}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

const primaryBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
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
  minWidth: '100px',
  justifyContent: 'center',
};

const ghostBtnStyle: React.CSSProperties = {
  ...primaryBtnStyle,
  background: 'transparent',
  color: 'var(--on-surface-variant)',
  border: '1px solid var(--outline-variant)',
};

function navBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    width: '44px',
    height: '44px',
    borderRadius: 'var(--radius-full)',
    border: '1px solid var(--outline-variant)',
    background: disabled ? 'transparent' : 'var(--surface-container)',
    color: disabled ? 'var(--outline)' : 'var(--on-surface)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    fontFamily: 'inherit',
    padding: 0,
  };
}
