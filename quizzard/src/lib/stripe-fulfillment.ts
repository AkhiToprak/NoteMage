import { db } from '@/lib/db';
import { stripe, tierFromPriceId } from '@/lib/stripe';
import type { Tier } from '@prisma/client';

/**
 * Verifies a user's payment directly with Stripe and fulfills the tier update.
 * Used as a fallback when the webhook hasn't processed yet.
 * Idempotent — returns early if tier is already set.
 */
export async function verifyAndFulfillCheckout(userId: string): Promise<Tier | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { tier: true, stripeCustomerId: true },
  });

  if (!user) return null;
  if (user.tier !== 'FREE') return user.tier;
  if (!user.stripeCustomerId) return null;

  try {
    const subscriptions = await stripe.subscriptions.list({
      customer: user.stripeCustomerId,
      status: 'active',
      limit: 1,
    });

    const sub = subscriptions.data[0];
    if (!sub) return null;

    const priceId = sub.items.data[0]?.price.id;
    if (!priceId) return null;

    const tier = tierFromPriceId(priceId);
    if (!tier || tier === 'FREE') return null;

    const periodEnd = sub.items.data[0]?.current_period_end;

    await db.user.update({
      where: { id: userId },
      data: {
        tier,
        pendingTier: null,
        stripeSubscriptionId: sub.id,
        subscriptionPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
      },
    });

    console.log(
      `[Stripe Fulfillment] Fallback fulfilled tier=${tier} for user=${userId} (webhook may not have arrived)`
    );

    return tier;
  } catch (error) {
    console.error('[Stripe Fulfillment] Error verifying checkout:', error);
    return null;
  }
}
