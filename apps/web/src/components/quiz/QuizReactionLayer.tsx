'use client';

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { Mascot } from '@/components/mascot/Mascot';
import { fireMascotConfetti } from '@/components/mascot/confetti';
import type { Reaction } from '@/lib/quiz-reactions';
import styles from './QuizReactionLayer.module.css';

export interface QuizReactionLayerHandle {
  fire(reaction: Reaction): void;
  dismiss(): void;
}

interface QuizReactionLayerProps {
  audioEnabled: boolean;
}

interface ActiveSlot {
  reaction: Reaction;
  id: number;
  exiting: boolean;
}

const EXIT_DURATION_MS = 220;

export const QuizReactionLayer = forwardRef<
  QuizReactionLayerHandle,
  QuizReactionLayerProps
>(function QuizReactionLayer({ audioEnabled }, ref) {
  const [active, setActive] = useState<ActiveSlot | null>(null);
  const idRef = useRef(0);
  const dismissTimerRef = useRef<number | null>(null);
  const exitTimerRef = useRef<number | null>(null);

  const clearTimers = useCallback(() => {
    if (dismissTimerRef.current !== null) {
      window.clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
    if (exitTimerRef.current !== null) {
      window.clearTimeout(exitTimerRef.current);
      exitTimerRef.current = null;
    }
  }, []);

  const beginExit = useCallback(() => {
    setActive((prev) => (prev ? { ...prev, exiting: true } : prev));
    clearTimers();
    exitTimerRef.current = window.setTimeout(() => {
      setActive(null);
      exitTimerRef.current = null;
    }, EXIT_DURATION_MS);
  }, [clearTimers]);

  const fire = useCallback(
    (reaction: Reaction) => {
      clearTimers();
      idRef.current += 1;
      setActive({ reaction, id: idRef.current, exiting: false });
    },
    [clearTimers],
  );

  useImperativeHandle(
    ref,
    () => ({
      fire,
      dismiss: beginExit,
    }),
    [fire, beginExit],
  );

  useEffect(() => {
    if (!active || active.exiting) return;

    if (active.reaction.confetti) {
      fireMascotConfetti();
    }

    if (audioEnabled && active.reaction.audio) {
      try {
        const audio = new Audio(`/sounds/${active.reaction.audio}.mp3`);
        audio.volume = 0.6;
        void audio.play().catch(() => undefined);
      } catch {
        // No-op: audio is best-effort, missing assets must not break the UI.
      }
    }

    dismissTimerRef.current = window.setTimeout(() => {
      beginExit();
    }, active.reaction.durationMs);

    return () => {
      if (dismissTimerRef.current !== null) {
        window.clearTimeout(dismissTimerRef.current);
        dismissTimerRef.current = null;
      }
    };
  }, [active, audioEnabled, beginExit]);

  useEffect(() => clearTimers, [clearTimers]);

  if (!active) return null;

  const { reaction, id, exiting } = active;

  if (reaction.display === 'corner') {
    return (
      <div className={styles.cornerWrap} aria-live="polite">
        <div
          className={`${styles.cornerCard}${exiting ? ` ${styles.cornerCardExit}` : ''}`}
          role="status"
        >
          <Mascot
            key={id}
            pose={reaction.pose}
            size={reaction.size}
            idle="none"
            oneShot={reaction.oneShot}
            alt=""
          />
          <span className={styles.cornerMessage}>{reaction.message}</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`${styles.overlayScrim}${exiting ? ` ${styles.overlayScrimExit}` : ''}`}
      role="dialog"
      aria-live="assertive"
      aria-label={reaction.message}
      onClick={beginExit}
    >
      <div
        className={`${styles.overlayCard}${exiting ? ` ${styles.overlayCardExit}` : ''}`}
        onClick={(event) => event.stopPropagation()}
      >
        <Mascot
          key={id}
          pose={reaction.pose}
          size={reaction.size}
          idle="none"
          oneShot={reaction.oneShot}
          alt=""
        />
        <span className={styles.overlayMessage}>{reaction.message}</span>
        <span className={styles.overlayHint}>Tap anywhere to continue</span>
      </div>
    </div>
  );
});
