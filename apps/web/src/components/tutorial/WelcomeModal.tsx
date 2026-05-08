'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useTutorial } from './TutorialContext';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { Mascot } from '@/components/mascot';

export function WelcomeModal() {
  const { start, skip } = useTutorial();
  const { isPhone } = useBreakpoint();
  const [opacity, setOpacity] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);

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
      if (e.key === 'Escape') skip();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [skip]);

  const enterDelay = (i: number) => (reduceMotion ? '0s' : `${0.05 + i * 0.06}s`);
  const itemTransform = opacity === 0 ? 'translateY(8px)' : 'translateY(0)';
  const itemTransition = reduceMotion
    ? 'none'
    : 'transform 0.45s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.45s cubic-bezier(0.22, 1, 0.36, 1)';

  return (
    <div
      onClick={skip}
      role="dialog"
      aria-modal="true"
      aria-labelledby="tutorial-welcome-title"
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
          maxWidth: 480,
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
          id="tutorial-welcome-title"
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
          Welcome to NoteMage
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
          A 60-second tour. We&apos;ll set up your first notebook and chat — skip anytime.
        </p>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            opacity,
            transform: itemTransform,
            transition: itemTransition,
            transitionDelay: enterDelay(4),
          }}
        >
          <button
            onClick={start}
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
            Take the tour
          </button>
          <button
            onClick={skip}
            style={{
              padding: '12px 24px',
              minHeight: 44,
              borderRadius: 'var(--radius-md)',
              background: 'transparent',
              color: 'var(--on-surface-variant)',
              border: '1px solid var(--outline)',
              fontSize: 14,
              fontWeight: 600,
              fontFamily: 'inherit',
              cursor: 'pointer',
            }}
          >
            Explore on my own
          </button>
        </div>
      </div>
    </div>
  );
}
