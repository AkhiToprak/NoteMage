'use client';

import { useSyncExternalStore } from 'react';

const emptySubscribe = () => () => {};

/**
 * Returns `false` during SSR and the first client paint, then `true`.
 *
 * Uses `useSyncExternalStore` with a constant client/server snapshot so it never
 * triggers the `set-state-in-effect` lint and reads as a clean
 * "have we hydrated yet?" signal. Used by `ResponsiveScreen` to avoid
 * committing to a viewport size before the breakpoint is known.
 */
export function useMounted(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}
