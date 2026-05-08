'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { Mascot } from '@/components/mascot';

export type CoworkTab = 'groups' | 'classes' | 'dms';

interface Props {
  onDismiss: () => void;
  onCardClick?: (tab: CoworkTab) => void;
}

interface FeatureCard {
  tab: CoworkTab;
  icon: string;
  headline: string;
  body: string;
}

const FEATURE_CARDS: FeatureCard[] = [
  {
    tab: 'groups',
    icon: 'groups',
    headline: 'Study Groups',
    body: 'Form a group, share notebooks, work through material together.',
  },
  {
    tab: 'classes',
    icon: 'school',
    headline: 'Classes',
    body: 'Build a class around a course or topic and bring your classmates in.',
  },
  {
    tab: 'dms',
    icon: 'chat',
    headline: 'Direct Messages',
    body: 'Message a friend directly, share a notebook, get help on a problem.',
  },
];

export function CoworkShowcaseModal({ onDismiss, onCardClick }: Props) {
  const { isPhone } = useBreakpoint();
  const [opacity, setOpacity] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [hoveredTab, setHoveredTab] = useState<CoworkTab | null>(null);
  const [isWideViewport, setIsWideViewport] = useState(false);
  const ctaRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read media query once on mount
      setReduceMotion(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
      const mq = window.matchMedia('(min-width: 720px)');
      setIsWideViewport(mq.matches);
      const onChange = (e: MediaQueryListEvent) => setIsWideViewport(e.matches);
      mq.addEventListener('change', onChange);
      const id = requestAnimationFrame(() => setOpacity(1));
      return () => {
        cancelAnimationFrame(id);
        mq.removeEventListener('change', onChange);
      };
    }
    const id = requestAnimationFrame(() => setOpacity(1));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDismiss]);

  useEffect(() => {
    ctaRef.current?.focus();
  }, []);

  const enterDelay = (i: number) => (reduceMotion ? '0s' : `${0.05 + i * 0.06}s`);
  const itemTransform = opacity === 0 ? 'translateY(8px)' : 'translateY(0)';
  const itemTransition = reduceMotion
    ? 'none'
    : 'transform 0.45s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.45s cubic-bezier(0.22, 1, 0.36, 1)';

  const handleCardActivate = (tab: CoworkTab) => {
    onCardClick?.(tab);
    onDismiss();
  };

  return (
    <>
      <style>{`
        .cowork-showcase-card:focus-visible {
          outline: 2px solid var(--primary);
          outline-offset: 2px;
        }
      `}</style>
    <div
      onClick={onDismiss}
      role="dialog"
      aria-modal="true"
      aria-labelledby="cowork-showcase-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1100,
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: isPhone ? 'flex-end' : 'center',
        justifyContent: 'center',
        paddingTop: 'max(24px, env(safe-area-inset-top, 0px))',
        paddingBottom: 'max(24px, env(safe-area-inset-bottom, 0px))',
        paddingLeft: 'max(16px, env(safe-area-inset-left, 0px))',
        paddingRight: 'max(16px, env(safe-area-inset-right, 0px))',
        opacity,
        transition: reduceMotion
          ? 'none'
          : 'opacity 0.35s cubic-bezier(0.22, 1, 0.36, 1)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--surface-container)',
          borderRadius: 'var(--radius-xl)',
          border: '1px solid var(--outline-variant)',
          padding: isPhone ? '32px 24px 28px' : '40px 32px 32px',
          width: '100%',
          maxWidth: 720,
          textAlign: 'center',
          boxShadow: '0 32px 64px rgba(0,0,0,0.5)',
          transform: opacity === 0 ? 'translateY(12px)' : 'translateY(0)',
          transition: reduceMotion
            ? 'none'
            : 'transform 0.4s cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            marginBottom: 20,
            opacity,
            transform: itemTransform,
            transition: itemTransition,
            transitionDelay: enterDelay(0),
          }}
        >
          <Image src="/logo_trimmed.png" alt="NoteMage" width={140} height={48} priority />
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            marginBottom: 12,
            opacity,
            transform: itemTransform,
            transition: itemTransition,
            transitionDelay: enterDelay(1),
          }}
        >
          <Mascot pose="wave" size="lg" idle="float" priority />
        </div>
        <h2
          id="cowork-showcase-title"
          style={{
            margin: '0 0 12px',
            fontFamily: 'var(--font-display)',
            fontSize: isPhone ? 24 : 26,
            fontWeight: 700,
            color: 'var(--on-surface)',
            letterSpacing: '-0.02em',
            opacity,
            transform: itemTransform,
            transition: itemTransition,
            transitionDelay: enterDelay(2),
          }}
        >
          Welcome to Co-Work
        </h2>
        <p
          style={{
            margin: '0 0 28px',
            fontSize: 15,
            lineHeight: 1.6,
            color: 'var(--on-surface-variant)',
            opacity,
            transform: itemTransform,
            transition: itemTransition,
            transitionDelay: enterDelay(3),
          }}
        >
          Three ways to study with others on NoteMage.
        </p>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isWideViewport ? 'repeat(3, 1fr)' : '1fr',
            gap: 14,
            marginBottom: 28,
            opacity,
            transform: itemTransform,
            transition: itemTransition,
            transitionDelay: enterDelay(4),
          }}
        >
          {FEATURE_CARDS.map((card, i) => {
            const isHovered = hoveredTab === card.tab;
            return (
              <div
                key={card.tab}
                className="cowork-showcase-card"
                role="button"
                tabIndex={0}
                onClick={() => handleCardActivate(card.tab)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleCardActivate(card.tab);
                  }
                }}
                onMouseEnter={() => setHoveredTab(card.tab)}
                onMouseLeave={() => setHoveredTab(null)}
                style={{
                  background: 'var(--surface-container-high)',
                  borderRadius: 'var(--radius-lg)',
                  border: '1px solid var(--outline-variant)',
                  padding: 20,
                  textAlign: 'left',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  transform:
                    !reduceMotion && isHovered ? 'translateY(-2px)' : 'translateY(0)',
                  transition: reduceMotion
                    ? 'none'
                    : 'transform 0.25s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.25s cubic-bezier(0.22, 1, 0.36, 1)',
                }}
                aria-label={`${card.headline}: ${card.body}`}
                data-card-index={i}
              >
                <span
                  className="material-symbols-outlined"
                  style={{
                    fontSize: 28,
                    color: 'var(--primary)',
                    lineHeight: 1,
                  }}
                  aria-hidden="true"
                >
                  {card.icon}
                </span>
                <div
                  style={{
                    fontSize: 15,
                    fontWeight: 700,
                    color: 'var(--on-surface)',
                    letterSpacing: '-0.01em',
                  }}
                >
                  {card.headline}
                </div>
                <div
                  style={{
                    fontSize: 13,
                    lineHeight: 1.5,
                    color: 'var(--on-surface-variant)',
                  }}
                >
                  {card.body}
                </div>
              </div>
            );
          })}
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            opacity,
            transform: itemTransform,
            transition: itemTransition,
            transitionDelay: enterDelay(5),
          }}
        >
          <button
            ref={ctaRef}
            onClick={onDismiss}
            style={{
              padding: '14px 32px',
              minHeight: 48,
              borderRadius: 'var(--radius-md)',
              background: 'var(--primary)',
              color: 'var(--background)',
              border: 'none',
              fontSize: 15,
              fontWeight: 700,
              fontFamily: 'inherit',
              cursor: 'pointer',
              transition: reduceMotion
                ? 'none'
                : 'transform 0.2s cubic-bezier(0.22,1,0.36,1)',
            }}
            onMouseEnter={(e) => {
              if (!reduceMotion) {
                (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.02)';
              }
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
            }}
          >
            Got it
          </button>
        </div>
      </div>
    </div>
    </>
  );
}
