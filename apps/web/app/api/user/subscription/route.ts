import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { stripe, TIER_PRICE_MAP } from '@/lib/stripe';
import {
  successResponse,
  badRequestResponse,
  unauthorizedResponse,
  internalErrorResponse,
} from '@/lib/api-response';

const VALID_TIERS = ['FREE', 'PLUS', 'PRO'] as const;
type ValidTier = (typeof VALID_TIERS)[number];

/** GET — return current subscription info */
export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        tier: true,
        pendingTier: true,
        subscriptionPeriodEnd: true,
      },
    });

    if (!user) return unauthorizedResponse();

    return successResponse(user);
  } catch (error) {
    console.error('[GET /api/user/subscription]', error);
    return internalErrorResponse();
  }
}

/** POST — cancel subscription or change plan via Stripe */
export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const body = await request.json();
    const { action, newTier } = body as { action: 'cancel' | 'change'; newTier?: string };

    if (action !== 'cancel' && action !== 'change') {
      return badRequestResponse('Invalid action. Must be "cancel" or "change".');
    }

    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        tier: true,
        subscriptionPeriodEnd: true,
        stripeSubscriptionId: true,
        stripeCustomerId: true,
      },
    });

    if (!user) return unauthorizedResponse();

    if (action === 'cancel') {
      if (user.tier === 'FREE') {
        return badRequestResponse('You are already on the Free plan.');
      }

      if (!user.stripeSubscriptionId) {
        return badRequestResponse('No active subscription to cancel.');
      }

      // Cancel at end of billing period via Stripe
      await stripe.subscriptions.update(user.stripeSubscriptionId, {
        cancel_at_period_end: true,
      });

      // Update local state to reflect pending cancellation
      const updated = await db.user.update({
        where: { id: userId },
        data: { pendingTier: 'FREE' },
        select: { tier: true, pendingTier: true, subscriptionPeriodEnd: true },
      });

      return successResponse(updated, 'Subscription will be cancelled at end of billing period.');
    }

    // action === 'change'
    if (!newTier || !VALID_TIERS.includes(newTier as ValidTier)) {
      return badRequestResponse('Invalid tier. Must be FREE, PLUS, or PRO.');
    }

    if (newTier === user.tier) {
      return badRequestResponse('You are already on this plan.');
    }

    // FREE → paid: need to go through Stripe checkout
    if (user.tier === 'FREE') {
      if (newTier === 'FREE') {
        return badRequestResponse('You are already on the Free plan.');
      }

      if (!user.stripeCustomerId) {
        // No Stripe customer yet — client should use checkout flow
        return successResponse({ requiresCheckout: true }, 'Payment required for upgrade.');
      }

      // Create a checkout session for the upgrade
      const priceId = TIER_PRICE_MAP[newTier as Exclude<ValidTier, 'FREE'>];
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        customer: user.stripeCustomerId,
        line_items: [{ price: priceId, quantity: 1 }],
        allow_promotion_codes: true,
        success_url: `${request.nextUrl.origin}/settings?upgrade_success=true`,
        cancel_url: `${request.nextUrl.origin}/settings`,
        metadata: { userId, tier: newTier },
      });

      return successResponse({ checkoutUrl: session.url }, 'Redirect to payment.');
    }

    // Paid → different paid: update subscription via Stripe
    if (!user.stripeSubscriptionId) {
      return badRequestResponse('No active subscription found.');
    }

    if (newTier === 'FREE') {
      // Downgrade to free = cancel subscription
      await stripe.subscriptions.update(user.stripeSubscriptionId, {
        cancel_at_period_end: true,
      });

      const updated = await db.user.update({
        where: { id: userId },
        data: { pendingTier: 'FREE' },
        select: { tier: true, pendingTier: true, subscriptionPeriodEnd: true },
      });

      return successResponse(updated, 'Plan change scheduled for end of billing period.');
    }

    // Switch between paid tiers (PLUS ↔ PRO)
    const subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
    const subscriptionItemId = subscription.items.data[0]?.id;

    if (!subscriptionItemId) {
      return internalErrorResponse('Could not find subscription item.');
    }

    const priceId = TIER_PRICE_MAP[newTier as Exclude<ValidTier, 'FREE'>];

    await stripe.subscriptions.update(user.stripeSubscriptionId, {
      items: [{ id: subscriptionItemId, price: priceId }],
      proration_behavior: 'create_prorations',
    });

    // The webhook will handle the actual tier update
    const updated = await db.user.update({
      where: { id: userId },
      data: { pendingTier: null },
      select: { tier: true, pendingTier: true, subscriptionPeriodEnd: true },
    });

    return successResponse(updated, 'Plan changed successfully.');
  } catch (error) {
    console.error('[POST /api/user/subscription]', error);
    return internalErrorResponse();
  }
}

/** DELETE — undo a pending tier change (reactivate subscription) */
export async function DELETE(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { stripeSubscriptionId: true },
    });

    if (user?.stripeSubscriptionId) {
      // Reactivate subscription (undo cancel_at_period_end)
      await stripe.subscriptions.update(user.stripeSubscriptionId, {
        cancel_at_period_end: false,
      });
    }

    const updated = await db.user.update({
      where: { id: userId },
      data: { pendingTier: null },
      select: { tier: true, pendingTier: true, subscriptionPeriodEnd: true },
    });

    return successResponse(updated, 'Pending change cancelled.');
  } catch (error) {
    console.error('[DELETE /api/user/subscription]', error);
    return internalErrorResponse();
  }
}
