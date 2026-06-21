'use client';

import { useBreakpoint } from '@/hooks/useBreakpoint';

/**
 * Phase-0 responsive switch for the figma build: `true` at ≥1024px (the
 * "switch at a breakpoint" boundary), `false` below.
 *
 * This is a thin wrapper over the app's existing `useBreakpoint()` so the whole
 * figma build reuses a single breakpoint source rather than inventing a parallel
 * matchMedia system. `useBreakpoint` is SSR-safe (via useSyncExternalStore) and
 * its `isDesktop` is exactly the ≥1024px tier.
 *
 * Note: the underlying store defaults to `desktop` pre-hydration. To avoid a
 * wrong-size flash on the responsive view, `ResponsiveScreen` gates its first
 * paint on `useMounted()` and only commits to a size once mounted.
 */
export function useIsDesktop(): boolean {
  return useBreakpoint().isDesktop;
}
