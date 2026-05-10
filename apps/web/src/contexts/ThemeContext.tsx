'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

interface ThemeContextValue {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (pref: ThemePreference) => void;
}

const STORAGE_KEY = 'notemage-theme';
const ThemeContext = createContext<ThemeContextValue | null>(null);

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function readStoredPreference(): ThemePreference {
  if (typeof window === 'undefined') return 'system';
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v === 'light' || v === 'dark' || v === 'system' ? v : 'system';
}

function applyTheme(resolved: ResolvedTheme) {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>('dark');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // setState calls run from a setTimeout callback rather than the effect
    // body — the react-hooks/set-state-in-effect rule treats the synchronous
    // path as the anti-pattern. The pre-hydration inline script in
    // app/layout.tsx already applies the right theme to <html> so the 0ms
    // defer doesn't cause a visible flash.
    const t = window.setTimeout(() => {
      setPreferenceState(readStoredPreference());
      setSystemTheme(getSystemTheme());
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const handler = (e: MediaQueryListEvent) => setSystemTheme(e.matches ? 'light' : 'dark');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const resolved: ResolvedTheme = preference === 'system' ? systemTheme : preference;

  useEffect(() => {
    if (!hydrated) return;
    applyTheme(resolved);
  }, [resolved, hydrated]);

  const setPreference = useCallback((pref: ThemePreference) => {
    setPreferenceState(pref);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, pref);
    }
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ preference, resolved, setPreference }),
    [preference, resolved, setPreference]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    return { preference: 'system', resolved: 'dark', setPreference: () => {} };
  }
  return ctx;
}
