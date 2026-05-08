'use client';

import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { TutorialContext } from '@/components/tutorial/TutorialContext';

const STORAGE_PREFIX = 'notemage-cowork-showcase';
const SHOWCASE_KEY = 'cowork';

function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}:${userId}`;
}

function readStored(userId: string | null | undefined): string | null {
  if (typeof window === 'undefined') return null;
  if (!userId) return null;
  try {
    return window.localStorage.getItem(storageKey(userId));
  } catch {
    return null;
  }
}

function writeStored(userId: string | null | undefined, value: string) {
  if (typeof window === 'undefined') return;
  if (!userId) return;
  try {
    window.localStorage.setItem(storageKey(userId), value);
  } catch {
    /* ignore quota / private mode */
  }
}

async function patchServer() {
  try {
    await fetch('/api/user/tutorial', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markShowcaseSeen: SHOWCASE_KEY }),
    });
  } catch {
    /* offline / unauthenticated — local mirror still works */
  }
}

export function useCoworkShowcase(): { isOpen: boolean; dismiss: () => void } {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();
  const tutorial = useContext(TutorialContext);

  const userId = session?.user?.id ?? null;
  const onboardingComplete = session?.user?.onboardingComplete === true;
  const serverSeen = session?.user?.tutorialState?.seenShowcases?.includes(SHOWCASE_KEY) === true;
  const tourActive = tutorial !== null && tutorial.step !== 'idle';
  const forceReplay = searchParams?.get('showcase') === SHOWCASE_KEY;

  const [hydrated, setHydrated] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const dismissedRef = useRef(false);

  useEffect(() => {
    if (!userId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset hydration when user signs out / changes
      setHydrated(false);
      dismissedRef.current = false;
      return;
    }
    const stored = readStored(userId);
    dismissedRef.current = stored !== null;
    setHydrated(true);
  }, [userId]);

  useEffect(() => {
    if (forceReplay) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- force-replay reacts to query param becoming present
      setIsOpen(true);
      return;
    }
    if (!hydrated) return;
    if (isOpen) return;
    if (dismissedRef.current) return;
    if (status !== 'authenticated' || !userId) return;
    if (!onboardingComplete) return;
    if (serverSeen) return;
    if (tourActive) return;
    if (pathname !== '/groups') return;

    setIsOpen(true);
  }, [
    forceReplay,
    hydrated,
    isOpen,
    status,
    userId,
    onboardingComplete,
    serverSeen,
    tourActive,
    pathname,
  ]);

  const dismiss = useCallback(() => {
    setIsOpen(false);
    dismissedRef.current = true;
    if (userId) {
      writeStored(userId, new Date().toISOString());
    }
    void patchServer();
  }, [userId]);

  return { isOpen, dismiss };
}
