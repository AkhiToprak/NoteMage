'use client';

import { useCallback } from 'react';
import { useTutorial } from './TutorialContext';
import type { TutorialTargetKey } from './types';

export function useTutorialTarget(key: TutorialTargetKey) {
  const { register, unregister } = useTutorial();
  return useCallback(
    (el: HTMLElement | null) => {
      if (el) register(key, el);
      else unregister(key);
    },
    [key, register, unregister]
  );
}
