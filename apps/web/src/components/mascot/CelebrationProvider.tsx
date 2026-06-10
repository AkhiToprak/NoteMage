'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { CelebrationOverlay } from './CelebrationOverlay';
import { type MascotOneShot, type MascotPose, type MascotSize } from './poses';

export interface CelebrationConfig {
  pose?: MascotPose;
  size?: MascotSize;
  oneShot?: MascotOneShot | null;
  eyebrow?: string;
  headline: string;
  subtext?: string;
  body?: ReactNode;
  accentColor?: string;
  accentFill?: string;
  continueLabel?: string;
  confetti?: boolean;
  audio?: string | null;
  audioEnabled?: boolean;
  onDismiss?: () => void;
}

interface QueueEntry extends CelebrationConfig {
  id: number;
}

export interface CelebrationContextValue {
  celebrate: (config: CelebrationConfig) => void;
  dismissCurrent: () => void;
}

const CelebrationContext = createContext<CelebrationContextValue | null>(null);

const EXIT_DURATION_MS = 240;

export function CelebrationProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<QueueEntry | null>(null);
  const [exiting, setExiting] = useState(false);
  const queueRef = useRef<QueueEntry[]>([]);
  const idRef = useRef(0);
  const exitTimerRef = useRef<number | null>(null);

  const clearExitTimer = () => {
    if (exitTimerRef.current !== null) {
      window.clearTimeout(exitTimerRef.current);
      exitTimerRef.current = null;
    }
  };

  const showNextOrClose = useCallback(() => {
    const next = queueRef.current.shift() ?? null;
    setActive(next);
    setExiting(false);
  }, []);

  const celebrate = useCallback((config: CelebrationConfig) => {
    idRef.current += 1;
    const entry: QueueEntry = { ...config, id: idRef.current };
    setActive((current) => {
      if (current === null) return entry;
      queueRef.current.push(entry);
      return current;
    });
  }, []);

  const dismissCurrent = useCallback(() => {
    setActive((current) => {
      if (!current) return current;
      current.onDismiss?.();
      setExiting(true);
      clearExitTimer();
      exitTimerRef.current = window.setTimeout(() => {
        showNextOrClose();
        exitTimerRef.current = null;
      }, EXIT_DURATION_MS);
      return current;
    });
  }, [showNextOrClose]);

  useEffect(() => () => clearExitTimer(), []);

  const value = useMemo<CelebrationContextValue>(
    () => ({ celebrate, dismissCurrent }),
    [celebrate, dismissCurrent],
  );

  return (
    <CelebrationContext.Provider value={value}>
      {children}
      {active && (
        <CelebrationOverlay
          key={active.id}
          pose={active.pose ?? 'celebrate'}
          size={active.size ?? 'lg'}
          oneShot={active.oneShot === undefined ? 'celebrate' : active.oneShot}
          eyebrow={active.eyebrow}
          headline={active.headline}
          subtext={active.subtext}
          body={active.body}
          accentColor={active.accentColor}
          accentFill={active.accentFill}
          continueLabel={active.continueLabel ?? 'Continue'}
          confetti={active.confetti ?? true}
          audio={active.audio ?? null}
          audioEnabled={active.audioEnabled ?? false}
          exiting={exiting}
          onContinue={dismissCurrent}
        />
      )}
    </CelebrationContext.Provider>
  );
}

export function useCelebration(): CelebrationContextValue {
  const ctx = useContext(CelebrationContext);
  if (!ctx) {
    throw new Error('useCelebration must be used within a CelebrationProvider');
  }
  return ctx;
}

export function useOptionalCelebration(): CelebrationContextValue | null {
  return useContext(CelebrationContext);
}
