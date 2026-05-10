'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { TutorialContext, type TutorialContextValue } from './TutorialContext';
import { TutorialOverlay } from './TutorialOverlay';
import type {
  TutorialCompletionResult,
  TutorialPersistedState,
  TutorialStep,
  TutorialTargetKey,
} from './types';

const STORAGE_PREFIX = 'notemage-tutorial';
const LEGACY_STORAGE_KEY = 'notemage-tutorial';

const ACTIVE_RESUMABLE_STEPS: ReadonlyArray<TutorialStep> = [
  'welcome',
  'step-1-dashboard',
  'step-2-notebook-form',
  'step-3-workspace',
  'step-4-chat-modal',
  'complete',
];

/**
 * Per-user storage key. Keying by userId prevents one user's tour state
 * (e.g. completedAt/dismissedAt) from leaking into another account on the
 * same browser — without this, the second user signs up and the welcome
 * tour silently bails because the first user's localStorage still says
 * "already done".
 */
function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}:${userId}`;
}

function readStored(userId: string | null | undefined): TutorialPersistedState {
  if (typeof window === 'undefined') return {};
  if (!userId) return {};
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as TutorialPersistedState;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeStored(userId: string | null | undefined, state: TutorialPersistedState) {
  if (typeof window === 'undefined') return;
  if (!userId) return;
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(state));
  } catch {
    /* ignore quota / private mode */
  }
}

function clearLegacyKey() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

async function patchServer(payload: {
  step?: string;
  dismissedAt?: string | null;
  reset?: boolean;
}) {
  try {
    await fetch('/api/user/tutorial', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    /* offline / unauthenticated — local mirror still works */
  }
}

async function postComplete(): Promise<TutorialCompletionResult | null> {
  try {
    const res = await fetch('/api/user/tutorial/complete', { method: 'POST' });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      success?: boolean;
      data?: {
        achievements?: { badge: string; name: string }[];
        alreadyComplete?: boolean;
      };
    };
    if (!json.success || !json.data) return null;
    return {
      achievements: json.data.achievements ?? [],
      alreadyComplete: json.data.alreadyComplete ?? false,
    };
  } catch {
    return null;
  }
}

export function TutorialProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { data: session, update: updateSession } = useSession();
  const onboardingComplete = session?.user?.onboardingComplete === true;
  const serverState = session?.user?.tutorialState;
  const userId = session?.user?.id ?? null;

  const [step, setStep] = useState<TutorialStep>('idle');
  const [hydrated, setHydrated] = useState(false);
  const [targetVersion, setTargetVersion] = useState(0);
  const [result, setResult] = useState<TutorialCompletionResult | null>(null);

  const targetsRef = useRef<Map<TutorialTargetKey, HTMLElement>>(new Map());
  const persistedRef = useRef<TutorialPersistedState>({});

  // Hydrate per-user state once we know who the user is. Re-runs on userId
  // change so a fresh signup on the same browser starts from a clean slate.
  useEffect(() => {
    if (!userId) return;
    clearLegacyKey();
    const stored = readStored(userId);
    persistedRef.current = stored;

    const resumable =
      stored.step && ACTIVE_RESUMABLE_STEPS.includes(stored.step) ? stored.step : 'idle';
    // eslint-disable-next-line react-hooks/set-state-in-effect -- SSR-safe localStorage hydration; same pattern as ThemeContext
    setStep(resumable);
    setHydrated(true);
  }, [userId]);

  // Reconcile with server: if completedAt/dismissedAt is set server-side but
  // local mirror doesn't know yet, adopt it and stand the tour down.
  useEffect(() => {
    if (!hydrated || !serverState) return;
    let mutated: TutorialPersistedState | null = null;

    if (serverState.completedAt && !persistedRef.current.completedAt) {
      mutated = { ...persistedRef.current, completedAt: serverState.completedAt };
    }
    if (serverState.dismissedAt && !persistedRef.current.dismissedAt) {
      mutated = {
        ...(mutated ?? persistedRef.current),
        dismissedAt: serverState.dismissedAt,
      };
    }

    if (mutated) {
      persistedRef.current = mutated;
      writeStored(userId, mutated);
      if (step !== 'idle' && step !== 'complete') {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- adopt server's terminal state
        setStep('idle');
      }
    }
  }, [hydrated, serverState, step, userId]);

  useEffect(() => {
    if (!hydrated) return;
    if (step !== 'idle') return;
    const stored = persistedRef.current;
    if (stored.completedAt || stored.dismissedAt) return;
    if (serverState?.completedAt || serverState?.dismissedAt) return;
    if (pathname !== '/dashboard') return;
    if (!onboardingComplete) return;

    // eslint-disable-next-line react-hooks/set-state-in-effect -- auto-fire welcome reacts to session/pathname becoming valid
    setStep('welcome');
    const next: TutorialPersistedState = { ...stored, step: 'welcome' };
    persistedRef.current = next;
    writeStored(userId, next);
    void patchServer({ step: 'welcome' });
  }, [hydrated, step, pathname, onboardingComplete, serverState, userId]);

  const persist = useCallback(
    (next: TutorialPersistedState) => {
      persistedRef.current = next;
      writeStored(userId, next);
    },
    [userId]
  );

  const start = useCallback(() => {
    setStep('step-1-dashboard');
    persist({ ...persistedRef.current, step: 'step-1-dashboard' });
    void patchServer({ step: 'step-1-dashboard' });
  }, [persist]);

  const skip = useCallback(() => {
    const dismissedAt = new Date().toISOString();
    setStep('idle');
    persist({
      ...persistedRef.current,
      step: 'idle',
      dismissedAt,
    });
    void patchServer({ step: 'idle', dismissedAt });
  }, [persist]);

  const complete = useCallback(() => {
    setStep('idle');
    setResult(null);
    persist({
      ...persistedRef.current,
      step: 'idle',
      completedAt: persistedRef.current.completedAt ?? new Date().toISOString(),
    });
  }, [persist]);

  const advance = useCallback(
    (next: TutorialStep) => {
      setStep(next);

      if (next === 'complete') {
        const completedAt = new Date().toISOString();
        persist({
          ...persistedRef.current,
          step: 'complete',
          completedAt,
        });
        void postComplete().then((res) => {
          if (res) {
            setResult(res);
            void updateSession();
          }
        });
      } else {
        persist({ ...persistedRef.current, step: next });
        void patchServer({ step: next });
      }
    },
    [persist, updateSession]
  );

  const restart = useCallback(() => {
    setResult(null);
    persistedRef.current = { step: 'welcome' };
    writeStored(userId, persistedRef.current);
    setStep('welcome');
    void patchServer({ reset: true }).then(() => {
      void patchServer({ step: 'welcome' });
      void updateSession();
    });
  }, [updateSession, userId]);

  const register = useCallback((key: TutorialTargetKey, el: HTMLElement) => {
    targetsRef.current.set(key, el);
    setTargetVersion((v) => v + 1);
  }, []);

  const unregister = useCallback((key: TutorialTargetKey) => {
    targetsRef.current.delete(key);
    setTargetVersion((v) => v + 1);
  }, []);

  const getTarget = useCallback(
    (key: TutorialTargetKey) => targetsRef.current.get(key) ?? null,
    []
  );

  const value = useMemo<TutorialContextValue>(
    () => ({
      step,
      hydrated,
      targetVersion,
      result,
      start,
      skip,
      complete,
      advance,
      restart,
      register,
      unregister,
      getTarget,
    }),
    [
      step,
      hydrated,
      targetVersion,
      result,
      start,
      skip,
      complete,
      advance,
      restart,
      register,
      unregister,
      getTarget,
    ]
  );

  return (
    <TutorialContext.Provider value={value}>
      {children}
      <TutorialOverlay />
    </TutorialContext.Provider>
  );
}
