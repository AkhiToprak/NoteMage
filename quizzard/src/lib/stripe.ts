import Stripe from 'stripe';
import type { Tier } from '@prisma/client';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  typescript: true,
});

/** Maps Quizzard tier names to Stripe Price IDs */
export const TIER_PRICE_MAP: Record<Exclude<Tier, 'FREE'>, string> = {
  PLUS: process.env.STRIPE_PLUS_PRICE_ID!,
  PRO: process.env.STRIPE_PRO_PRICE_ID!,
};

/** Reverse lookup: given a Stripe price ID, return the Quizzard tier */
export function tierFromPriceId(priceId: string): Tier | null {
  if (priceId === process.env.STRIPE_PLUS_PRICE_ID) return 'PLUS';
  if (priceId === process.env.STRIPE_PRO_PRICE_ID) return 'PRO';
  return null;
}
