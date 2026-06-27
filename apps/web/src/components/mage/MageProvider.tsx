'use client';

/* Hallmark · component: provider · genre: editorial · theme: project (Neon Scholar)
 * Mage Revolution Phase 1 — the global panel's open/close + current-context
 * state. No UI of its own; MagePanel (and the sidebar "Ask Mage" card)
 * consume `useMage()`.
 */

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { MageClientContext } from '@/lib/mage-types';

interface MageContextValue {
  isOpen: boolean;
  /** Open the panel, optionally replacing the current context. */
  open: (context?: MageClientContext) => void;
  close: () => void;
  toggle: () => void;
  /** The context the panel sends with each message (Phase 2 wires surfaces). */
  context: MageClientContext;
  /** Replace the current context (used by `useRegisterMageContext` in Phase 2). */
  setContext: (context: MageClientContext) => void;
}

const DEFAULT_CONTEXT: MageClientContext = { type: 'global' };

const MageCtx = createContext<MageContextValue | null>(null);

export function MageProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [context, setContextState] = useState<MageClientContext>(DEFAULT_CONTEXT);

  const open = useCallback((next?: MageClientContext) => {
    if (next) setContextState(next);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((v) => !v), []);
  const setContext = useCallback((next: MageClientContext) => setContextState(next), []);

  const value = useMemo<MageContextValue>(
    () => ({ isOpen, open, close, toggle, context, setContext }),
    [isOpen, open, close, toggle, context, setContext]
  );

  return <MageCtx.Provider value={value}>{children}</MageCtx.Provider>;
}

/** Access the Mage panel controller. Throws if used outside <MageProvider>. */
export function useMage(): MageContextValue {
  const ctx = useContext(MageCtx);
  if (!ctx) throw new Error('useMage must be used within <MageProvider>');
  return ctx;
}

/** Non-throwing variant for components that may render outside the provider. */
export function useOptionalMage(): MageContextValue | null {
  return useContext(MageCtx);
}
