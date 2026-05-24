'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTutorial } from './TutorialContext';
import { useCelebration, Mascot } from '@/components/mascot';
import { useBreakpoint } from '@/hooks/useBreakpoint';

export function CompletionModal() {
  const { isPro } = useTutorial();
  // FREE users get a "what Pro unlocks" recap (subtle upsell); PRO users get
  // the celebratory achievement overlay.
  return isPro ? <ProCompletion /> : <FreeCompletion />;
}

// PRO — celebratory mascot overlay + the Apprentice Mage achievement.
function ProCompletion() {
  const { complete, result } = useTutorial();
  const { celebrate } = useCelebration();
  const firedRef = useRef(false);

  const apprenticeUnlocked =
    result?.achievements.some((a) => a.badge === 'apprentice_mage') ?? false;
  const showApprentice = result === null || apprenticeUnlocked;

  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;

    const body = showApprentice ? (
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
          <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--on-surface)' }}>
            Apprentice Mage unlocked
          </p>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--on-surface-variant)' }}>
            Complete the welcome tour
          </p>
        </div>
      </div>
    ) : undefined;

    celebrate({
      pose: 'graduation',
      size: 'lg',
      oneShot: 'celebrate',
      eyebrow: 'Tutorial complete',
      headline: "You're a mage now",
      subtext:
        "That's the lay of the land. Your notebooks and the Learn hub are ready whenever you are — paths, flashcards, quizzes, and chat, all from your material.",
      body,
      continueLabel: 'Start exploring',
      onDismiss: complete,
    });
  }, [celebrate, complete, showApprentice]);

  return null;
}

// FREE — recap of what Pro unlocks. Honest list of real tier-gated features.
const PRO_UNLOCKS: ReadonlyArray<{ icon: string; label: string }> = [
  { icon: 'school', label: 'Generate your own study paths' },
  { icon: 'all_inclusive', label: 'Unlimited flashcards, quizzes & chat' },
  { icon: 'edit_note', label: 'Inline AI editing in your notes' },
  { icon: 'picture_as_pdf', label: '450 PDF pages imported a month' },
];

function FreeCompletion() {
  const { complete } = useTutorial();
  const router = useRouter();
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
      if (e.key === 'Escape') complete();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [complete]);

  const seePro = () => {
    complete();
    router.push('/pricing');
  };

  const cardTransition = reduceMotion
    ? 'none'
    : 'transform 0.4s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.35s cubic-bezier(0.22, 1, 0.36, 1)';

  return (
    <div
      onClick={complete}
      role="dialog"
      aria-modal="true"
      aria-labelledby="tutorial-free-complete-title"
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
          padding: isPhone ? '28px 24px 24px' : '36px 32px 28px',
          width: '100%',
          maxWidth: 460,
          textAlign: 'center',
          boxShadow: '0 32px 64px rgba(0,0,0,0.5)',
          transform: opacity === 0 ? 'translateY(12px)' : 'translateY(0)',
          transition: cardTransition,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
          <Mascot pose="graduation" size="lg" idle="float" />
        </div>
        <h2
          id="tutorial-free-complete-title"
          style={{
            margin: '0 0 8px',
            fontFamily: 'var(--font-display)',
            fontSize: isPhone ? 22 : 24,
            fontWeight: 700,
            color: 'var(--on-surface)',
            letterSpacing: '-0.02em',
          }}
        >
          You&apos;re all set
        </h2>
        <p
          style={{
            margin: '0 0 20px',
            fontSize: 14,
            lineHeight: 1.6,
            color: 'var(--on-surface-variant)',
          }}
        >
          That&apos;s the tour — your notebooks and the Learn hub are ready. Here&apos;s what Pro
          adds when you want it.
        </p>

        <div
          style={{
            textAlign: 'left',
            padding: '16px',
            marginBottom: 20,
            background: 'var(--surface-container-high)',
            border: '1px solid var(--outline-variant)',
            borderRadius: 'var(--radius-lg)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span
              style={{
                padding: '2px 8px',
                borderRadius: 'var(--radius-full)',
                background: 'rgba(255, 222, 89, 0.14)',
                border: '1px solid rgba(255, 222, 89, 0.32)',
                color: '#ffde59',
                fontSize: 10,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
              }}
            >
              Pro
            </span>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--on-surface)' }}>
              What you&apos;ll unlock
            </span>
          </div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {PRO_UNLOCKS.map(({ icon, label }) => (
              <li key={label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span
                  className="material-symbols-outlined"
                  aria-hidden="true"
                  style={{ fontSize: 20, color: 'var(--primary)', flexShrink: 0 }}
                >
                  {icon}
                </span>
                <span style={{ fontSize: 14, color: 'var(--on-surface)' }}>{label}</span>
              </li>
            ))}
          </ul>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            onClick={seePro}
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
              transition: reduceMotion ? 'none' : 'transform 0.2s cubic-bezier(0.22,1,0.36,1)',
            }}
            onMouseEnter={(e) => {
              if (!reduceMotion) e.currentTarget.style.transform = 'scale(1.02)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            See Pro
          </button>
          <button
            onClick={complete}
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
            Start exploring
          </button>
        </div>
      </div>
    </div>
  );
}
