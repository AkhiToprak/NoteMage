'use client';

import { useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { usePostHog } from 'posthog-js/react';
import { hasAnalyticsConsent } from '@/lib/analytics/consent';

// Ties PostHog events to the signed-in NextAuth user. identify() and reset()
// are no-ops while the user is opted out, so this is safe before consent.
export function PostHogIdentify() {
  const { data: session, status } = useSession();
  const posthog = usePostHog();
  const wasAuthenticated = useRef(false);

  useEffect(() => {
    if (!posthog) return;

    if (status === 'authenticated' && session?.user) {
      // Only forward the user's email/name/etc. to PostHog once they've given
      // explicit analytics consent. identify() already no-ops while opted out,
      // but gating on the explicit consent flag makes the PII boundary clear
      // and avoids queuing an identify that flushes if consent is later granted.
      if (hasAnalyticsConsent()) {
        posthog.identify(session.user.id, {
          email: session.user.email ?? undefined,
          name: session.user.name ?? undefined,
          username: session.user.username,
          tier: session.user.tier,
          role: session.user.role,
        });
      }
      wasAuthenticated.current = true;
    } else if (status === 'unauthenticated' && wasAuthenticated.current) {
      // Logout transition only — resetting a never-authenticated visitor
      // would churn their anonymous distinct_id on every page load.
      posthog.reset();
      wasAuthenticated.current = false;
    }
  }, [posthog, session, status]);

  return null;
}
