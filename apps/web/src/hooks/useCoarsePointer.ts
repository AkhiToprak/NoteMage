'use client';

import { useSyncExternalStore } from 'react';

// Detects a coarse pointer (touch / stylus / in-app WebView) SSR-safely via
// `useSyncExternalStore` — the lint-blessed alternative to useEffect+setState,
// mirroring the store pattern in `useBreakpoint`. Used to swap keyboard-only
// affordances ("Show Hint (H)", "Space to flip") for touch-friendly copy on
// devices that have no physical keyboard.
const COARSE_POINTER_QUERY = '(pointer: coarse)';

function subscribe(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const mql = window.matchMedia(COARSE_POINTER_QUERY);
  mql.addEventListener('change', callback);
  return () => mql.removeEventListener('change', callback);
}

function getSnapshot(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(COARSE_POINTER_QUERY).matches;
}

// The server can't know the pointer type — assume fine (keyboard) so the
// hydrated markup matches the keyboard-capable default, then refine on mount.
function getServerSnapshot(): boolean {
  return false;
}

export function useCoarsePointer(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
