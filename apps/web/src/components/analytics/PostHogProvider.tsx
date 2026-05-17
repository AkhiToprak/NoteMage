'use client';

import posthog from 'posthog-js';
import { PostHogProvider as PHProvider } from 'posthog-js/react';

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;

// Initialised once at module load (client only). Kept here rather than in
// instrumentation-client.ts so Sentry keeps owning sentry.client.config.ts —
// adding instrumentation-client.ts would make Sentry stop auto-injecting it.
if (typeof window !== 'undefined' && POSTHOG_KEY) {
  posthog.init(POSTHOG_KEY, {
    api_host: '/ingest',
    ui_host: 'https://eu.posthog.com',
    defaults: '2026-01-30',
    // GDPR: opt-out by default — no events, no cookies — until the user
    // consents via optInAnalytics() (src/lib/analytics/consent.ts).
    opt_out_capturing_by_default: true,
    // Session replay records the screen; deliberately off for the
    // consent-gated posture. Enable explicitly if a replay flow is added.
    disable_session_recording: true,
  });
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  return <PHProvider client={posthog}>{children}</PHProvider>;
}
