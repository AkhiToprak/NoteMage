'use client';

import { useEffect } from 'react';

const HEARTBEAT_INTERVAL_MS = 30_000;
const HEARTBEAT_URL = '/api/user/study-heartbeat';

/**
 * Pings the study-heartbeat endpoint every 30 seconds while the tab is
 * visible. Pauses automatically when the tab is hidden so leaving Notemage
 * open in a background tab (or overnight) doesn't keep racking up minutes.
 *
 * Mounted from `(dashboard)/layout.tsx` so it covers the whole authed app.
 * Disabled when `enabled === false` (e.g. unauthenticated session).
 */
export function useStudyHeartbeat(enabled: boolean) {
  useEffect(() => {
    if (!enabled || typeof document === 'undefined') return;

    let cancelled = false;

    const ping = () => {
      if (cancelled) return;
      if (document.visibilityState !== 'visible') return;
      // Fire-and-forget; the server dedupes by minute, so dropped pings are
      // recovered by the next tick.
      fetch(HEARTBEAT_URL, { method: 'POST', keepalive: true }).catch(() => {});
    };

    // Fire one immediately on mount and on every visibility-becomes-visible
    // transition so a brand-new minute gets credited without waiting up to 30s.
    ping();

    const interval = setInterval(ping, HEARTBEAT_INTERVAL_MS);

    const onVisibility = () => {
      if (document.visibilityState === 'visible') ping();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [enabled]);
}
