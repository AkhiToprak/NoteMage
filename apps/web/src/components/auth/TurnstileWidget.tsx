'use client';

import { useEffect, useRef } from 'react';

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

/**
 * True when Turnstile is configured client-side. Gate a submit button (or
 * require a token) only when this is on, so the challenge is fully dormant
 * until NEXT_PUBLIC_TURNSTILE_SITE_KEY is set.
 */
export const turnstileEnabled = !!SITE_KEY;

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  remove: (id: string) => void;
};
declare global {
  // eslint-disable-next-line no-var
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let scriptPromise: Promise<void> | null = null;

function loadTurnstileScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise<void>((resolve, reject) => {
      const s = document.createElement('script');
      s.src = SCRIPT_SRC;
      s.async = true;
      s.defer = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Turnstile script failed to load'));
      document.head.appendChild(s);
    });
  }
  return scriptPromise;
}

interface TurnstileWidgetProps {
  /** Called with the verification token (or '' when it expires/errors). */
  onToken: (token: string) => void;
}

/**
 * Cloudflare Turnstile challenge. Renders nothing when the site key is unset,
 * so it is a no-op until configured. On success it reports the token to the
 * parent, which sends it with the form submit; the server verifies it via
 * src/lib/turnstile.ts. Works in native WebViews (no special-casing needed).
 */
export default function TurnstileWidget({ onToken }: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;

  useEffect(() => {
    if (!SITE_KEY) return;
    let widgetId: string | null = null;
    let cancelled = false;
    loadTurnstileScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        widgetId = window.turnstile.render(containerRef.current, {
          sitekey: SITE_KEY,
          theme: 'dark',
          callback: (token: string) => onTokenRef.current(token),
          'expired-callback': () => onTokenRef.current(''),
          'error-callback': () => onTokenRef.current(''),
        });
      })
      .catch(() => {
        /* script blocked (adblock/offline) → no token; the server still gates */
      });
    return () => {
      cancelled = true;
      if (widgetId && window.turnstile) {
        try {
          window.turnstile.remove(widgetId);
        } catch {
          /* widget already gone */
        }
      }
    };
  }, []);

  if (!SITE_KEY) return null;
  return <div ref={containerRef} style={{ display: 'flex', justifyContent: 'center' }} />;
}
