'use client';

import { useSyncExternalStore } from 'react';

export type Breakpoint = 'phone' | 'tablet' | 'desktop';

interface BreakpointResult {
  /** Current breakpoint token */
  bp: Breakpoint;
  /** 0–767px: phones */
  isPhone: boolean;
  /** 768–1023px: iPads */
  isTablet: boolean;
  /** 1024px+: desktops, iPad Pro landscape */
  isDesktop: boolean;
  /** Convenience: phone OR tablet (not desktop) */
  isPhoneOrTablet: boolean;
}

const PHONE_QUERY = '(max-width: 767px)';
const TABLET_QUERY = '(min-width: 768px) and (max-width: 1023px)';

function getBreakpoint(): Breakpoint {
  if (typeof window === 'undefined') return 'desktop';
  if (window.matchMedia(PHONE_QUERY).matches) return 'phone';
  if (window.matchMedia(TABLET_QUERY).matches) return 'tablet';
  return 'desktop';
}

function subscribe(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const phoneMql = window.matchMedia(PHONE_QUERY);
  const tabletMql = window.matchMedia(TABLET_QUERY);
  phoneMql.addEventListener('change', callback);
  tabletMql.addEventListener('change', callback);
  return () => {
    phoneMql.removeEventListener('change', callback);
    tabletMql.removeEventListener('change', callback);
  };
}

function getServerSnapshot(): Breakpoint {
  return 'desktop';
}

/**
 * Reactive breakpoint hook for responsive inline styles.
 *
 * Breakpoints:
 * - phone:   0–767px   (iPhone SE, standard phones)
 * - tablet:  768–1023px (iPad Mini, iPad, iPad Air)
 * - desktop: 1024px+   (iPad Pro landscape, laptops, monitors)
 *
 * SSR-safe: defaults to 'desktop', hydrates on mount via
 * `useSyncExternalStore` (the React-canonical pattern for subscribing
 * to external stores like matchMedia, replacing the older
 * useEffect+setState pattern flagged by react-hooks/set-state-in-effect).
 */
export function useBreakpoint(): BreakpointResult {
  const bp = useSyncExternalStore(subscribe, getBreakpoint, getServerSnapshot);

  return {
    bp,
    isPhone: bp === 'phone',
    isTablet: bp === 'tablet',
    isDesktop: bp === 'desktop',
    isPhoneOrTablet: bp !== 'desktop',
  };
}
