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
import { useCelebration } from '@/components/mascot';
import type { Reaction, ReactionKind } from '@/lib/quiz-reactions';
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

const EYEBROW_BY_KIND: Partial<Record<ReactionKind, string>> = {
  perfect_score: 'Perfect score',
  checkpoint_pass: 'Checkpoint complete',
};

export const QuizReactionLayer = forwardRef<
  QuizReactionLayerHandle,
  QuizReactionLayerProps
>(function QuizReactionLayer({ audioEnabled }, ref) {
  const [active, setActive] = useState<ActiveSlot | null>(null);
  const idRef = useRef(0);
  const dismissTimerRef = useRef<number | null>(null);
  const exitTimerRef = useRef<number | null>(null);
  const ownsCelebrationRef = useRef(false);
  const { celebrate, dismissCurrent } = useCelebration();

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
    if (ownsCelebrationRef.current) {
      ownsCelebrationRef.current = false;
      dismissCurrent();
      return;
    }
    setActive((prev) => (prev ? { ...prev, exiting: true } : prev));
    clearTimers();
    exitTimerRef.current = window.setTimeout(() => {
      setActive(null);
      exitTimerRef.current = null;
    }, EXIT_DURATION_MS);
  }, [clearTimers, dismissCurrent]);

  const fire = useCallback(
    (reaction: Reaction) => {
      clearTimers();
      if (reaction.display === 'overlay') {
        ownsCelebrationRef.current = true;
        celebrate({
          pose: reaction.pose,
          size: reaction.size,
          oneShot: reaction.oneShot,
          eyebrow: EYEBROW_BY_KIND[reaction.kind],
          headline: reaction.message,
          confetti: reaction.confetti,
          audio: reaction.audio,
          audioEnabled,
          onDismiss: () => {
            ownsCelebrationRef.current = false;
          },
        });
        setActive(null);
        return;
      }
      idRef.current += 1;
      setActive({ reaction, id: idRef.current, exiting: false });
    },
    [clearTimers, celebrate, audioEnabled],
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
});
