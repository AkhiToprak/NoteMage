'use client';

/**
 * Browser-side Lemon Squeezy overlay checkout — the web/desktop payment entry
 * point. Loads Lemon.js and opens the hosted overlay for the NoteMage Pro
 * product; the customer picks the cadence (weekly / monthly / yearly) on the LS
 * checkout itself. Fulfillment is server-side via the webhook (authoritative),
 * with /sync as a slow-webhook fallback.
 */

import { type BillingInterval } from '@/lib/tiers';

declare global {
  interface Window {
    createLemonSqueezy?: () => void;
    LemonSqueezy?: {
      Setup: (opts: { eventHandler: (event: { event: string; data?: unknown }) => void }) => void;
      Url: { Open: (url: string) => void; Close?: () => void };
    };
  }
}

const LEMON_JS = 'https://app.lemonsqueezy.com/js/lemon.js';
let lemonReady: Promise<void> | null = null;
let onCompletedCb: ((subscriptionId: string | null) => void) | null = null;

// Per-cadence checkout URLs. Each Pro variant (weekly / monthly / yearly) has
// its own Lemon Squeezy buy URL — pointing the overlay at a variant URL pre-
// selects that cadence instead of showing the picker. These MUST be literal
// `process.env.NEXT_PUBLIC_*` reads so Next inlines them into the client bundle.
const CHECKOUT_URL_BY_INTERVAL: Record<BillingInterval, string | undefined> = {
  weekly: process.env.NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL_WEEKLY,
  monthly: process.env.NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL_MONTHLY,
  yearly: process.env.NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL_YEARLY,
};

/**
 * Resolve the checkout URL for a chosen cadence. Falls back to the generic
 * product URL (which shows LS's own cadence picker) whenever a per-interval URL
 * isn't configured — so leaving the new env vars unset is a graceful no-op that
 * preserves today's behavior, never a break.
 */
function resolveCheckoutUrl(interval?: BillingInterval): string {
  const specific = interval ? CHECKOUT_URL_BY_INTERVAL[interval] : undefined;
  const base = specific || process.env.NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL;
  if (!base) throw new Error('NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL is not set');
  return base;
}

function loadLemon(): Promise<void> {
  if (lemonReady) return lemonReady;
  lemonReady = new Promise<void>((resolve, reject) => {
    if (typeof window === 'undefined') return reject(new Error('not in browser'));
    if (window.LemonSqueezy) return resolve();

    const script = document.createElement('script');
    script.src = LEMON_JS;
    script.defer = true;
    script.onload = () => {
      window.createLemonSqueezy?.();
      window.LemonSqueezy?.Setup({
        eventHandler: (event) => {
          // Checkout.Success carries the order payload; pull the subscription id
          // for the /sync fallback. LS sometimes hands the order back before the
          // subscription record is created (first_subscription_id is null for a
          // few hundred ms), so we ALWAYS invoke the callback — the webhook is
          // the authoritative provisioner; /sync is just an optimization. If we
          // gated on subId here, the wizard would silently hang on a paid order.
          if (event.event === 'Checkout.Success' && onCompletedCb) {
            const data = event.data as
              | { order?: { data?: { attributes?: { first_subscription_id?: string | number } } } }
              | undefined;
            const rawSubId = data?.order?.data?.attributes?.first_subscription_id;
            const subId = rawSubId != null ? String(rawSubId) : null;
            if (subId == null) {
              console.warn(
                '[Lemon Squeezy] Checkout.Success fired without first_subscription_id; relying on webhook.'
              );
            }
            onCompletedCb(subId);
            // Dismiss the LS success screen so the user doesn't have to hit the
            // ✕ to return, and never sees the "View order" CTA that would whisk
            // them off-domain mid-onboarding. The caller's onCompleted has
            // already kicked off the post-payment work asynchronously.
            try {
              window.LemonSqueezy?.Url.Close?.();
            } catch {
              // No-op: older lemon.js builds may not expose Close.
            }
          }
        },
      });
      resolve();
    };
    script.onerror = () => reject(new Error('Lemon.js failed to load'));
    document.head.appendChild(script);
  });
  return lemonReady;
}

export interface OpenProCheckoutOptions {
  /** NoteMage user id — bound into checkout custom data so the webhook/sync resolve the account. */
  userId: string;
  /** Pre-fills the checkout email when known. */
  email?: string;
  /**
   * Chosen billing cadence. Opens that variant's checkout (pre-selected) when a
   * per-interval URL is configured; otherwise the generic product URL is used.
   */
  interval?: BillingInterval;
  /**
   * Fires on Checkout.Success after payment is taken. The LS subscription id is
   * passed when available (so callers can hit /sync for an immediate provision);
   * `null` means the order arrived before the subscription record was created,
   * and the caller should rely on the webhook for fulfillment.
   */
  onCompleted?: (subscriptionId: string | null) => void;
}

/**
 * Open the Lemon Squeezy overlay checkout for NoteMage Pro. The purchase is
 * bound to the account via checkout[custom][user_id]; fulfillment happens
 * server-side through the webhook (authoritative) with /sync as a slow-webhook
 * fallback.
 */
export async function openProCheckout(opts: OpenProCheckoutOptions): Promise<void> {
  const base = resolveCheckoutUrl(opts.interval);

  onCompletedCb = opts.onCompleted ?? null;

  const url = new URL(base);
  url.searchParams.set('embed', '1');
  url.searchParams.set('checkout[custom][user_id]', opts.userId);
  if (opts.email) url.searchParams.set('checkout[email]', opts.email);

  await loadLemon();
  if (!window.LemonSqueezy) throw new Error('Lemon Squeezy failed to initialize');
  window.LemonSqueezy.Url.Open(url.toString());
}
