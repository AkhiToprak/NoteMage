'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Mascot } from './Mascot';
import { fireMascotConfetti } from './confetti';
import { type MascotOneShot, type MascotPose, type MascotSize } from './poses';
import styles from './celebration-overlay.module.css';

export interface CelebrationOverlayProps {
  pose: MascotPose;
  size: MascotSize;
  oneShot: MascotOneShot | null;
  eyebrow?: string;
  headline: string;
  subtext?: string;
  body?: ReactNode;
  accentColor?: string;
  accentFill?: string;
  continueLabel: string;
  confetti: boolean;
  audio: string | null;
  audioEnabled: boolean;
  exiting: boolean;
  onContinue: () => void;
}

const CONFETTI_DELAY_MS = 720;

export function CelebrationOverlay({
  pose,
  size,
  oneShot,
  eyebrow,
  headline,
  subtext,
  body,
  accentColor,
  accentFill,
  continueLabel,
  confetti,
  audio,
  audioEnabled,
  exiting,
  onContinue,
}: CelebrationOverlayProps) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const mascotWrapRef = useRef<HTMLDivElement | null>(null);
  const continueRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (exiting) return;

    let cancelled = false;
    const confettiTimer = confetti
      ? window.setTimeout(() => {
          if (cancelled) return;
          fireMascotConfetti({ origin: mascotWrapRef.current ?? cardRef.current });
        }, CONFETTI_DELAY_MS)
      : null;

    if (audioEnabled && audio) {
      try {
        const el = new Audio(`/sounds/${audio}.mp3`);
        el.volume = 0.6;
        void el.play().catch(() => undefined);
      } catch {
        // Audio is best-effort; missing assets must not break the UI.
      }
    }

    return () => {
      cancelled = true;
      if (confettiTimer !== null) window.clearTimeout(confettiTimer);
    };
  }, [confetti, audio, audioEnabled, exiting]);

  useEffect(() => {
    if (exiting) return;
    const focusTimer = window.setTimeout(() => continueRef.current?.focus(), 900);
    return () => window.clearTimeout(focusTimer);
  }, [exiting]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter') onContinue();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onContinue]);

  if (typeof document === 'undefined') return null;

  const cardStyle =
    accentColor || accentFill
      ? ({
          '--accent-color': accentColor ?? 'var(--primary)',
          '--accent-fill': accentFill ?? 'rgba(174, 137, 255, 0.12)',
        } as React.CSSProperties)
      : undefined;

  const overlay = (
    <div
      className={`${styles.scrim}${exiting ? ` ${styles.scrimExit}` : ''}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="celebration-headline"
      onClick={onContinue}
    >
      <div
        ref={cardRef}
        className={`${styles.card}${exiting ? ` ${styles.cardExit}` : ''}`}
        style={cardStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <div ref={mascotWrapRef} className={`${styles.mascotSlot} ${styles.mascotEnter}`}>
          <Mascot
            pose={pose}
            size={size}
            idle="bounce"
            oneShot={oneShot}
            priority
            alt=""
          />
        </div>

        {eyebrow && <div className={styles.eyebrow}>{eyebrow}</div>}

        <h2 id="celebration-headline" className={styles.headline}>
          {headline}
        </h2>

        {subtext && <p className={styles.subtext}>{subtext}</p>}

        {body && <div className={styles.body}>{body}</div>}

        <button
          ref={continueRef}
          type="button"
          className={styles.continue}
          onClick={onContinue}
        >
          {continueLabel}
        </button>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}
