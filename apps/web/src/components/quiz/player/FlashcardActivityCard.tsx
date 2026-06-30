'use client';

/* Hallmark · component: flashcard activity card · genre: editorial · theme: project (cream / --quiz-* + --nm-* tokens)
 * states: flip card has hover (cursor) · focus-visible ring · the flip itself is the press feedback
 * contrast: pass (semantic tokens only — theme-flipping cream↔navy, no inline hex)
 * Hallmark · pre-emit critique: P5 H5 E4 S5 R5 V4
 *
 * The white flip card that frames a checkpoint flashcard inside QuizPlayerShell
 * (Figma "Quiz screens" — practice). It mirrors TheoryActivityCard's chrome (a
 * cream nm-primary badge + the white --quiz-card surface + the floating shadow)
 * so the deck reads as the same family as theory + quiz instead of the old dark
 * overlay. The 3D flip keeps the front/back recall affordance; both faces are
 * the cream reading surface, captioned images included. Deck navigation +
 * completion live in the shell's action bar (the parent drives this controlled).
 */

import type { ReactNode } from 'react';
import MarkdownRenderer from '@/components/ui/MarkdownRenderer';

export interface FlashcardCard {
  id: string;
  question: string;
  answer: string;
  images?: Array<{
    id: string;
    side: string;
    fileName: string;
    caption?: string | null;
  }>;
}

export default function FlashcardActivityCard({
  card,
  isFlipped,
  onFlip,
  isPhone,
  coarsePointer,
}: {
  card: FlashcardCard;
  isFlipped: boolean;
  onFlip: () => void;
  isPhone: boolean;
  coarsePointer: boolean;
}): ReactNode {
  return (
    <div style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
      <style>{`
        .nm-fc-card:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 4px; border-radius: var(--radius-xl); }
        .nm-fc-text :where(h1,h2,h3,h4,p):first-child { margin-top: 0; }
        .nm-fc-text :where(p):last-child { margin-bottom: 0; }
        .nm-fc-text a { text-decoration: none; }
        @media (prefers-reduced-motion: reduce) {
          .nm-fc-card { transition: none !important; }
        }
      `}</style>
      <div style={{ width: '100%', maxWidth: '720px', perspective: '1400px' }}>
        <div
          className="nm-fc-card"
          role="button"
          tabIndex={0}
          aria-label={isFlipped ? 'Show question' : 'Show answer'}
          onClick={onFlip}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onFlip();
            }
          }}
          style={{
            position: 'relative',
            width: '100%',
            height: 'min(58vh, 540px)',
            minHeight: isPhone ? 280 : 340,
            transformStyle: 'preserve-3d',
            transition: 'transform 0.55s var(--ease-spring)',
            transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
            cursor: 'pointer',
          }}
        >
          <CardFace side="front" card={card} isFlipped={isFlipped} isPhone={isPhone} coarsePointer={coarsePointer} />
          <CardFace side="back" card={card} isFlipped={isFlipped} isPhone={isPhone} coarsePointer={coarsePointer} />
        </div>
      </div>
    </div>
  );
}

function CardFace({
  side,
  card,
  isFlipped,
  isPhone,
  coarsePointer,
}: {
  side: 'front' | 'back';
  card: FlashcardCard;
  isFlipped: boolean;
  isPhone: boolean;
  coarsePointer: boolean;
}) {
  const isFront = side === 'front';
  const text = isFront ? card.question : card.answer;
  const images = card.images?.filter((img) => img.side === side) ?? [];
  // Both faces live in the DOM for the 3D flip; hide the non-visible one from
  // assistive tech so the question and answer aren't announced at once.
  const faceHidden = isFront ? isFlipped : !isFlipped;
  return (
    <div
      aria-hidden={faceHidden}
      style={{
        position: 'absolute',
        inset: 0,
        backfaceVisibility: 'hidden',
        WebkitBackfaceVisibility: 'hidden',
        background: 'var(--quiz-card)',
        border: '1px solid var(--quiz-card-border)',
        borderRadius: 'var(--radius-xl)',
        boxShadow: '0 1px 2px rgb(15 15 30 / 0.04), 0 14px 34px rgb(15 15 30 / 0.05)',
        color: 'var(--on-surface)',
        padding: isPhone ? '20px 18px' : '28px 32px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        overflow: 'auto',
        transform: isFront ? undefined : 'rotateY(180deg)',
      }}
    >
      <span
        style={{
          alignSelf: 'flex-start',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '5px 11px',
          borderRadius: 'var(--radius-full)',
          background: 'var(--nm-primary-light)',
          color: 'var(--nm-primary-on-light)',
          fontSize: '12px',
          fontWeight: 700,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          flexShrink: 0,
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 15 }} aria-hidden>
          {isFront ? 'help' : 'lightbulb'}
        </span>
        {isFront ? 'Question' : 'Answer'}
      </span>

      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '18px',
          textAlign: 'center',
          minHeight: 0,
        }}
      >
        <div
          className="nm-fc-text"
          style={{
            fontSize: isPhone ? 'clamp(17px, 4.4vw, 20px)' : 'clamp(19px, 2.2vw, 23px)',
            lineHeight: 1.55,
            maxWidth: '58ch',
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
            {images.map((img) => {
              const caption = img.caption?.trim();
              return (
                <figure
                  key={img.id}
                  style={{
                    margin: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '6px',
                    maxWidth: '100%',
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/uploads/flashcard-images/${img.id}`}
                    alt={caption || img.fileName}
                    loading="lazy"
                    onError={(e) => {
                      const fig = e.currentTarget.closest('figure');
                      if (fig) (fig as HTMLElement).style.display = 'none';
                    }}
                    style={{
                      maxWidth: '100%',
                      maxHeight: '220px',
                      borderRadius: 'var(--radius-md)',
                      objectFit: 'contain',
                      border: '1px solid var(--quiz-card-border)',
                    }}
                  />
                  {caption ? (
                    <figcaption
                      style={{
                        fontSize: '12px',
                        lineHeight: 1.4,
                        textAlign: 'center',
                        color: 'var(--on-surface-variant)',
                      }}
                    >
                      {caption}
                    </figcaption>
                  ) : null}
                </figure>
              );
            })}
          </div>
        ) : null}
      </div>

      {isFront ? (
        <span
          style={{
            alignSelf: 'center',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '12px',
            fontWeight: 600,
            color: 'var(--on-surface-variant)',
            flexShrink: 0,
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 15 }} aria-hidden>
            touch_app
          </span>
          {coarsePointer ? 'Tap to reveal' : 'Tap or press Space to reveal'}
        </span>
      ) : null}
    </div>
  );
}
