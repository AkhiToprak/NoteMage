'use client';

/**
 * Decides whether to show the welcome-back takeover. On app entry it asks the
 * server (`POST /api/user/welcome-back`) whether the user has been away longer
 * than the absence threshold, reading the persisted `User.lastSeenAt`. That
 * endpoint claims the return atomically, so the takeover fires at most once per
 * absence — and, crucially, it works for users who were already away *before*
 * this feature shipped, since the decision is based on their real last-active
 * timestamp rather than anything written by this code.
 */

import dynamic from 'next/dynamic';
import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';

const WelcomeBackOverlay = dynamic(
  () => import('./WelcomeBackOverlay').then((m) => m.WelcomeBackOverlay),
  { ssr: false },
);

export function WelcomeBackGate() {
  const { data: session, status } = useSession();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (status !== 'authenticated' || !session?.user?.id) return;
    // never interrupt a user who is still onboarding
    if (session.user.onboardingComplete === false) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/user/welcome-back', { method: 'POST' });
        if (!res.ok) return;
        const json = (await res.json()) as { data?: { wasAway?: boolean } };
        if (!cancelled && json?.data?.wasAway) setShow(true);
      } catch {
        /* network/parse error — silently skip the takeover */
      }
    })();
    return () => { cancelled = true; };
    // keyed on auth identity so the check runs once per app entry
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, session?.user?.id]);

  if (!show) return null;
  return <WelcomeBackOverlay onDismiss={() => setShow(false)} />;
}

export default WelcomeBackGate;
