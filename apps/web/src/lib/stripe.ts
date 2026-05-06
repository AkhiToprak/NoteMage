import Stripe from 'stripe';
import type { Tier } from '@prisma/client';

let _stripe: Stripe | null = null;

/** Lazily initialised Stripe client — avoids crashing at build time when env vars are absent. */
export function getStripe(): Stripe {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY environment variable is missing');
    }
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      typescript: true,
    });
  }
  return _stripe;
}

/** @deprecated Use `getStripe()` instead — kept for backward compatibility. */
export const stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    return (getStripe() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

/** Maps Notemage tier names to Stripe Price IDs */
export const TIER_PRICE_MAP: Record<Exclude<Tier, 'FREE'>, string> = {
  PLUS: process.env.STRIPE_PLUS_PRICE_ID ?? '',
  PRO: process.env.STRIPE_PRO_PRICE_ID ?? '',
};

/** Reverse lookup: given a Stripe price ID, return the Notemage tier */
export function tierFromPriceId(priceId: string): Tier | null {
  if (priceId === process.env.STRIPE_PLUS_PRICE_ID) return 'PLUS';
  if (priceId === process.env.STRIPE_PRO_PRICE_ID) return 'PRO';
  return null;
}
