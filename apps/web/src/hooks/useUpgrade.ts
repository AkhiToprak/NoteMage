'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useCallback, useRef, useState } from 'react';
import { openProCheckout } from '@/lib/lemonsqueezy-client';

/**
 * Starts the NoteMage Pro upgrade flow for a logged-in user via the Lemon
 * Squeezy overlay checkout (the customer picks the cadence on the LS checkout).
 * Logged-out callers are sent to login first (no anonymous purchases). On
 * Checkout.Success it pings the /sync fallback and refreshes the session so the
 * UI flips to PRO without waiting for the webhook (which remains authoritative).
 *
 * Pass `onSuccess` to run your own follow-up after a completed purchase (e.g.
 * the onboarding wizard advancing to the next step). When omitted, the default
 * is `router.refresh()` so existing callers (Settings) keep working unchanged.
 *
 * Web/desktop only for now; iOS upgrades go through the native bridge (Phase B).
 */
export function useUpgrade(onSuccess?: () => void) {
  const { data: session, update } = useSession();
  const router = useRouter();
  const [upgrading, setUpgrading] = useState(false);
  // Held in a ref so a fresh inline callback each render doesn't churn the
  // memoised startUpgrade identity.
  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;

  const startUpgrade = useCallback(async () => {
    const userId = session?.user?.id;
    if (!userId) {
      router.push('/auth/login');
      return;
    }

    setUpgrading(true);
    try {
      await openProCheckout({
        userId,
        email: session?.user?.email ?? undefined,
        onCompleted: async (subscriptionId) => {
          // The webhook is authoritative — /sync just shortens the latency. We
          // attempt it best-effort when LS handed us a subscription id, but the
          // wizard MUST advance either way: a paid order should never leave the
          // user stuck on the upgrade screen.
          //
          // Re-arm `upgrading` for the post-payment window: the outer finally
          // already flipped it off when openProCheckout resolved (overlay open).
          // We've just auto-closed the overlay, so the wizard's primary button
          // is briefly clickable again — keep it disabled until we advance.
          setUpgrading(true);
          try {
            if (subscriptionId) {
              try {
                const res = await fetch('/api/billing/lemonsqueezy/sync', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ subscriptionId }),
                });
                if (!res.ok) {
                  // fetch only throws on network errors — HTTP 4xx/5xx land here.
                  console.error('[useUpgrade] /sync returned', res.status);
                }
              } catch (e) {
                console.error('[useUpgrade] /sync threw', e);
              }
            }
            await update();
            if (onSuccessRef.current) onSuccessRef.current();
            else router.refresh();
          } finally {
            setUpgrading(false);
          }
        },
      });
    } catch (e) {
      // openProCheckout throws on a missing checkout URL or a Lemon.js load
      // failure. Swallowing it left the CTA silently dead; rethrow so callers
      // can surface a user-visible error.
      console.error('[useUpgrade] checkout failed to open', e);
      throw e;
    } finally {
      // Re-enable once the overlay is up; payment continues inside it.
      setUpgrading(false);
    }
  }, [session?.user?.id, session?.user?.email, router, update]);

  return { startUpgrade, upgrading };
}
