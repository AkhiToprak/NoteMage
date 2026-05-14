'use client';

import { useEffect, useRef } from 'react';
import { useTutorial } from './TutorialContext';
import { useCelebration } from '@/components/mascot';

export function CompletionModal() {
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
    ) : undefined;

    celebrate({
      pose: 'graduation',
      size: 'lg',
      oneShot: 'celebrate',
      eyebrow: 'Tutorial complete',
      headline: "You're a mage now",
      subtext:
        'Your first notebook and chat are live. Add notes, ask questions, make quizzes — your call from here.',
      body,
      continueLabel: 'Start exploring',
      onDismiss: complete,
    });
  }, [celebrate, complete, showApprentice]);

  return null;
}
