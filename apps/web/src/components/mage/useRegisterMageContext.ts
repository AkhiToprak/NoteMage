'use client';

/* Mage Revolution Phase 2 — surface → panel context registration.
 *
 * A surface (a lesson, a study pack, the path map, …) calls this with the thin
 * context it represents. The hook pushes that context into the MageProvider so
 * the panel's card, prompt chips, and — crucially — the server-side grounding
 * (lesson theory, page text, pack/path outline) all follow whatever the learner
 * is looking at. On unmount it resets to a plain global turn so a stale surface
 * context never lingers after navigation.
 *
 * No-op outside <MageProvider> (e.g. an SSR-only subtree) — uses the optional
 * accessor so a surface can register unconditionally without guarding.
 */

import { useEffect } from 'react';
import type { MageClientContext } from '@/lib/mage-types';
import { useOptionalMage } from './MageProvider';

const GLOBAL_CONTEXT: MageClientContext = { type: 'global' };

/**
 * Register the current surface's Mage context. Pass `null` to register nothing
 * (e.g. while data is still loading) — the panel stays on its prior/global
 * context until a real one arrives.
 *
 * The effect keys off the SERIALIZED context, so it only re-runs when a field
 * actually changes — callers can build the object inline each render without
 * thrashing the provider.
 */
export function useRegisterMageContext(context: MageClientContext | null): void {
  const mage = useOptionalMage();
  const setContext = mage?.setContext;
  const serialized = context ? JSON.stringify(context) : null;

  useEffect(() => {
    if (!setContext || !serialized) return;
    setContext(JSON.parse(serialized) as MageClientContext);
    return () => setContext(GLOBAL_CONTEXT);
  }, [setContext, serialized]);
}

export default useRegisterMageContext;
