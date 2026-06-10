import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { cancelLemonSqueezySubscription } from '@/lib/lemonsqueezy';
import {
  successResponse,
  badRequestResponse,
  unauthorizedResponse,
  internalErrorResponse,
} from '@/lib/api-response';

const VALID_TIERS = ['FREE', 'PRO'] as const;

/**
 * PUT /api/user/tier  { tier: 'FREE' | 'PRO' }
 *
 * Upgrades are NOT handled here — paid tiers are activated through Lemon Squeezy
 * (web/desktop) or RevenueCat (iOS) and fulfilled by their webhooks. This
 * endpoint only services a downgrade ("Cancel"): it cancels with the active
 * provider rather than writing `tier='FREE'` directly, since a direct write
 * would desync from a subscription that is still billing.
 */
export async function PUT(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const body = await request.json();
    const { tier } = body;

    if (!tier || !VALID_TIERS.includes(tier)) {
      return badRequestResponse('Invalid tier. Must be FREE or PRO.');
    }

    if (tier !== 'FREE') {
      return badRequestResponse('Paid tiers must be activated through payment.');
    }

    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        tier: true,
        entitlementSource: true,
        lemonSqueezySubscriptionId: true,
        pendingTier: true,
        subscriptionPeriodEnd: true,
      },
    });
    if (!user) return unauthorizedResponse();

    // Already free — nothing to cancel.
    if (user.tier === 'FREE') {
      return successResponse({ tier: 'FREE', pendingTier: null });
    }

    // App Store subscriptions can only be cancelled by the user in iOS Settings.
    if (user.entitlementSource === 'APPLE_IAP') {
      return badRequestResponse(
        'This subscription is managed through the App Store. Cancel it there.'
      );
    }

    // Lemon Squeezy: cancel at period end; keep PRO until then.
    if (user.entitlementSource === 'LEMON_SQUEEZY' && user.lemonSqueezySubscriptionId) {
      await cancelLemonSqueezySubscription(user.lemonSqueezySubscriptionId);
      const updated = await db.user.update({
        where: { id: userId },
        data: { pendingTier: 'FREE' },
        select: { tier: true, pendingTier: true, subscriptionPeriodEnd: true },
      });
      return successResponse(updated);
    }

    // No provider backing the tier (e.g. a MANUAL admin grant) — safe to drop now.
    const updated = await db.user.update({
      where: { id: userId },
      data: { tier: 'FREE', entitlementSource: null, pendingTier: null, subscriptionPeriodEnd: null },
      select: { tier: true, pendingTier: true },
    });
    return successResponse(updated);
  } catch (error) {
    console.error('[PUT /api/user/tier]', error);
    return internalErrorResponse();
  }
}
