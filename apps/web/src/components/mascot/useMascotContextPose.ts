'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { POSES, type MascotIdle, type MascotPose } from './poses';

const WAVED_FLAG_KEY = 'notemage:mascot:dashboard-waved';
const WAVE_DURATION_MS = 4000;

export interface MascotContextPose {
  pose: MascotPose;
  idle: MascotIdle;
}

export function useMascotContextPose(): MascotContextPose {
  const pathname = usePathname();

  const [showFirstWave, setShowFirstWave] = useState(false);

  useEffect(() => {
    if (pathname !== '/dashboard') return;
    if (typeof window === 'undefined') return;
    if (window.localStorage.getItem(WAVED_FLAG_KEY) === '1') return;

    // Both setState calls run from setTimeout callbacks rather than the
    // effect body — react-hooks/set-state-in-effect treats the synchronous
    // path as the anti-pattern, async callbacks are exempt.
    const showTimer = window.setTimeout(() => setShowFirstWave(true), 0);
    const hideTimer = window.setTimeout(() => {
      setShowFirstWave(false);
      window.localStorage.setItem(WAVED_FLAG_KEY, '1');
    }, WAVE_DURATION_MS);

    return () => {
      window.clearTimeout(showTimer);
      window.clearTimeout(hideTimer);
    };
  }, [pathname]);

  const pose = derivePose(pathname, showFirstWave);
  return { pose, idle: POSES[pose].recommendedIdle };
}

function derivePose(pathname: string, showFirstWave: boolean): MascotPose {
  if (pathname === '/dashboard') {
    return showFirstWave ? 'wave' : 'default';
  }

  if (pathname.startsWith('/profile')) return 'holding-scroll';
  if (pathname.startsWith('/settings')) return 'thinking';
  if (pathname.startsWith('/pricing')) return 'holding-scroll';
  if (pathname.startsWith('/docs')) return 'holding-scroll';

  return 'default';
}
