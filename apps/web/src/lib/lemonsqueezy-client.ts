'use client';

/**
 * Browser-side Lemon Squeezy overlay checkout — the web/desktop payment entry
 * point. Loads Lemon.js and opens the hosted overlay for the NoteMage Pro
 * product; the customer picks the cadence (weekly / monthly / yearly) on the LS
 * checkout itself. Fulfillment is server-side via the webhook (authoritative),
 * with /sync as a slow-webhook fallback.
 */

declare global {
  interface Window {
    createLemonSqueezy?: () => void;
    LemonSqueezy?: {
      Setup: (opts: { eventHandler: (event: { event: string; data?: unknown }) => void }) => void;
      Url: { Open: (url: string) => void };
    };
  }
}

const LEMON_JS = 'https://app.lemonsqueezy.com/js/lemon.js';
let lemonReady: Promise<void> | null = null;
let onCompletedCb: ((subscriptionId: string) => void) | null = null;

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
          // for the /sync fallback.
          if (event.event === 'Checkout.Success' && onCompletedCb) {
            const data = event.data as
              | { order?: { data?: { attributes?: { first_subscription_id?: string | number } } } }
              | undefined;
            const subId = data?.order?.data?.attributes?.first_subscription_id;
            if (subId != null) onCompletedCb(String(subId));
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
  /** Fires on Checkout.Success with the LS subscription id (for the /sync fallback). */
  onCompleted?: (subscriptionId: string) => void;
}

/**
 * Open the Lemon Squeezy overlay checkout for NoteMage Pro. The purchase is
 * bound to the account via checkout[custom][user_id]; fulfillment happens
 * server-side through the webhook (authoritative) with /sync as a slow-webhook
 * fallback.
 */
export async function openProCheckout(opts: OpenProCheckoutOptions): Promise<void> {
  const base = process.env.NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL;
  if (!base) throw new Error('NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL is not set');

  onCompletedCb = opts.onCompleted ?? null;

  const url = new URL(base);
  url.searchParams.set('embed', '1');
  url.searchParams.set('checkout[custom][user_id]', opts.userId);
  if (opts.email) url.searchParams.set('checkout[email]', opts.email);

  await loadLemon();
  if (!window.LemonSqueezy) throw new Error('Lemon Squeezy failed to initialize');
  window.LemonSqueezy.Url.Open(url.toString());
}
