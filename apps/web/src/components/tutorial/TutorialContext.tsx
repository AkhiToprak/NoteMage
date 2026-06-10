'use client';

import { createContext, useContext } from 'react';
import type { TutorialCompletionResult, TutorialStep, TutorialTargetKey } from './types';

export interface TutorialContextValue {
  step: TutorialStep;
  hydrated: boolean;
  /** True when the signed-in user is on the PRO tier — drives tier-aware copy. */
  isPro: boolean;
  /** True on phones (<768px) — drops the desktop-only `notebooks` step. */
  isPhone: boolean;
  targetVersion: number;
  result: TutorialCompletionResult | null;
  start: () => void;
  skip: () => void;
  complete: () => void;
  advance: (next: TutorialStep) => void;
  restart: () => void;
  register: (key: TutorialTargetKey, el: HTMLElement) => void;
  unregister: (key: TutorialTargetKey) => void;
  getTarget: (key: TutorialTargetKey) => HTMLElement | null;
}

export const TutorialContext = createContext<TutorialContextValue | null>(null);

export function useTutorial(): TutorialContextValue {
  const ctx = useContext(TutorialContext);
  if (!ctx) {
    throw new Error('useTutorial must be used within TutorialProvider');
  }
  return ctx;
}
