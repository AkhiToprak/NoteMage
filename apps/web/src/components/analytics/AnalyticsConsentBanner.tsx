'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  isAnalyticsConsentUndecided,
  optInAnalytics,
  optOutAnalytics,
} from '@/lib/analytics/consent';
import { isInsideNativeShell } from '@/lib/native-bridge';

const SPRING = 'cubic-bezier(0.22, 1, 0.36, 1)';

export function AnalyticsConsentBanner() {
  const [show, setShow] = useState(false);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    // No PostHog key configured → analytics is disabled; don't ask for
    // consent to something that isn't running.
    if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
    // Native iOS / Electron shells run their own consent flow — the web
    // banner must never appear inside them.
    if (isInsideNativeShell()) return;
    if (!isAnalyticsConsentUndecided()) return;

    // Defer to the next frame: avoids a synchronous setState in the effect
    // body, and lets the off-screen state paint before the slide-in runs
    // (a freshly mounted node won't transition from a style it never had).
    let revealRaf = 0;
    const showRaf = requestAnimationFrame(() => {
      setShow(true);
      revealRaf = requestAnimationFrame(() => setEntered(true));
    });
    return () => {
      cancelAnimationFrame(showRaf);
      cancelAnimationFrame(revealRaf);
    };
  }, []);

  if (!show) return null;

  const decide = (accept: boolean) => {
    if (accept) optInAnalytics();
    else optOutAnalytics();
    setEntered(false);
    window.setTimeout(() => setShow(false), 400);
  };

  return (
    <div
      role="region"
      aria-label="Analytics consent"
      style={{
        position: 'fixed',
        bottom: 'calc(20px + env(safe-area-inset-bottom))',
        left: 16,
        right: 16,
        maxWidth: 400,
        zIndex: 1000,
        background: 'var(--surface-container-high)',
        border: '1px solid var(--outline-variant)',
        borderRadius: 'var(--radius-lg)',
        padding: 18,
        boxShadow: '0 16px 40px rgba(0, 0, 0, 0.3), 0 4px 16px rgba(174, 137, 255, 0.12)',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        transform: entered ? 'translateY(0)' : 'translateY(16px)',
        opacity: entered ? 1 : 0,
        transition: `transform 0.4s ${SPRING}, opacity 0.3s ${SPRING}`,
        fontFamily: 'var(--font-sans)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
        <span
          aria-hidden
          style={{
            flexShrink: 0,
            width: 34,
            height: 34,
            borderRadius: 'var(--radius-sm)',
            background: 'var(--primary)',
            color: 'var(--on-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 19 }}>
            insights
          </span>
        </span>
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 16,
            fontWeight: 600,
            letterSpacing: '-0.01em',
            color: 'var(--on-surface)',
          }}
        >
          Help improve Notemage
        </span>
      </div>

      <p
        style={{
          margin: 0,
          fontSize: 14,
          lineHeight: 1.55,
          color: 'var(--on-surface-variant)',
        }}
      >
        We&rsquo;d like to measure how features are used so we can make Notemage better. Nothing is
        collected unless you allow it &mdash; see our{' '}
        <Link
          href="/privacy"
          style={{
            color: 'var(--primary)',
            textDecoration: 'underline',
            textUnderlineOffset: 2,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--primary-fixed)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--primary)';
          }}
        >
          Privacy Policy
        </Link>
        .
      </p>

      <div style={{ display: 'flex', gap: 10 }}>
        <button
          type="button"
          onClick={() => decide(false)}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--surface-container-highest)';
            e.currentTarget.style.transform = 'translateY(-2px)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
          style={{
            flex: 1,
            padding: '10px 14px',
            borderRadius: 'var(--radius-md)',
            background: 'transparent',
            border: '1px solid var(--outline-variant)',
            color: 'var(--on-surface)',
            fontFamily: 'var(--font-sans)',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            transition: `transform 0.2s ${SPRING}`,
          }}
        >
          Decline
        </button>
        <button
          type="button"
          onClick={() => decide(true)}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--primary-fixed)';
            e.currentTarget.style.transform = 'translateY(-2px)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'var(--primary)';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
          style={{
            flex: 1,
            padding: '10px 14px',
            borderRadius: 'var(--radius-md)',
            background: 'var(--primary)',
            border: '1px solid transparent',
            color: 'var(--on-primary)',
            fontFamily: 'var(--font-sans)',
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
            transition: `transform 0.2s ${SPRING}`,
          }}
        >
          Allow analytics
        </button>
      </div>
    </div>
  );
}
