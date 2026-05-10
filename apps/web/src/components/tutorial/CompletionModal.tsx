'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { useTutorial } from './TutorialContext';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { Mascot, fireMascotConfetti } from '@/components/mascot';

export function CompletionModal() {
  const { complete, result } = useTutorial();
  const { isPhone } = useBreakpoint();
  const [opacity, setOpacity] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);

  const mascotRef = useRef<HTMLDivElement | null>(null);

  const apprenticeUnlocked =
    result?.achievements.some((a) => a.badge === 'apprentice_mage') ?? false;
  // Result hasn't arrived yet — assume the optimistic award is happening.
  // If the server later says alreadyComplete, the result will overwrite this.
  const showApprentice = result === null || apprenticeUnlocked;

  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read media query once on mount
      setReduceMotion(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    }
    const id = requestAnimationFrame(() => setOpacity(1));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') complete();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [complete]);

  const enterDelay = (i: number) => (reduceMotion ? '0s' : `${0.05 + i * 0.06}s`);
  const itemTransform = opacity === 0 ? 'translateY(8px)' : 'translateY(0)';
  const itemTransition = reduceMotion
    ? 'none'
    : 'transform 0.45s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.45s cubic-bezier(0.22, 1, 0.36, 1)';

  return (
    <div
      onClick={complete}
      role="dialog"
      aria-modal="true"
      aria-labelledby="tutorial-complete-title"
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
        transition: reduceMotion ? 'none' : 'opacity 0.35s cubic-bezier(0.22, 1, 0.36, 1)',
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
          maxWidth: 480,
          textAlign: 'center',
          boxShadow: '0 32px 64px rgba(0,0,0,0.5)',
          transform: opacity === 0 ? 'translateY(12px)' : 'translateY(0)',
          transition: reduceMotion ? 'none' : 'transform 0.4s cubic-bezier(0.22, 1, 0.36, 1)',
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
          <Image src="/logo_trimmed.png" alt="NoteMage" width={140} height={48} />
        </div>
        <div
          ref={mascotRef}
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
          <Mascot
            pose="graduation"
            size="lg"
            idle="float"
            oneShot="celebrate"
            onOneShotEnd={() => {
              fireMascotConfetti({ origin: mascotRef.current });
            }}
            priority
          />
        </div>
        <h2
          id="tutorial-complete-title"
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
          You&apos;re a mage now
        </h2>
        <p
          style={{
            margin: '0 0 24px',
            fontSize: 15,
            lineHeight: 1.6,
            color: 'var(--on-surface-variant)',
            opacity,
            transform: itemTransform,
            transition: itemTransition,
            transitionDelay: enterDelay(3),
          }}
        >
          Your first notebook and chat are live. Add notes, ask questions, make quizzes — your call
          from here.
        </p>

        {showApprentice && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              marginBottom: 24,
              opacity,
              transform: itemTransform,
              transition: itemTransition,
              transitionDelay: enterDelay(4),
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 16px',
                background: 'var(--surface-container-high)',
                border: '1px solid var(--outline-variant)',
                borderRadius: 'var(--radius-md)',
                textAlign: 'left',
              }}
            >
              <span
                aria-hidden="true"
                className="material-symbols-outlined filled"
                style={{ fontSize: 22, color: 'var(--primary)' }}
              >
                school
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p
                  style={{
                    margin: 0,
                    fontSize: 14,
                    fontWeight: 700,
                    color: 'var(--on-surface)',
                  }}
                >
                  Apprentice Mage unlocked
                </p>
                <p
                  style={{
                    margin: '2px 0 0',
                    fontSize: 12,
                    color: 'var(--on-surface-variant)',
                  }}
                >
                  Complete the welcome tour
                </p>
              </div>
            </div>
          </div>
        )}

        <div
          style={{
            opacity,
            transform: itemTransform,
            transition: itemTransition,
            transitionDelay: enterDelay(5),
          }}
        >
          <button
            onClick={complete}
            style={{
              padding: '14px 24px',
              minHeight: 48,
              borderRadius: 'var(--radius-md)',
              background: 'var(--primary)',
              color: 'var(--background)',
              border: 'none',
              fontSize: 15,
              fontWeight: 700,
              fontFamily: 'inherit',
              cursor: 'pointer',
              width: '100%',
              transition: reduceMotion ? 'none' : 'transform 0.2s cubic-bezier(0.22,1,0.36,1)',
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
            Start exploring
          </button>
        </div>
      </div>
    </div>
  );
}
