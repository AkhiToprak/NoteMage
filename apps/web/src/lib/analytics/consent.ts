import posthog from 'posthog-js';

// Consent gating for PostHog. Capture is opt-out by default (see
// PostHogProvider) — the consent banner calls optInAnalytics() /
// optOutAnalytics() to record the user's explicit choice.

// PostHog's own opt-in/opt-out state can't express "no decision yet" once
// opt_out_capturing_by_default is set — a fresh visitor already counts as
// opted out. So the explicit choice is mirrored to this localStorage key;
// its presence is the source of truth for whether the banner still shows.
const DECISION_KEY = 'notemage-analytics-consent';

function rememberDecision(value: 'granted' | 'denied'): void {
  try {
    window.localStorage.setItem(DECISION_KEY, value);
  } catch {
    // localStorage can throw (private mode, storage disabled) — non-fatal.
  }
}

export function optInAnalytics(): void {
  posthog.opt_in_capturing();
  rememberDecision('granted');
}

export function optOutAnalytics(): void {
  posthog.opt_out_capturing();
  rememberDecision('denied');
}

export function hasAnalyticsConsent(): boolean {
  return posthog.has_opted_in_capturing();
}

// True until the user has made an explicit allow-or-deny choice — drives
// whether the consent banner renders.
export function isAnalyticsConsentUndecided(): boolean {
  try {
    return window.localStorage.getItem(DECISION_KEY) === null;
  } catch {
    return true;
  }
}
