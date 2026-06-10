import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { getLemonSqueezyPortalUrl } from '@/lib/lemonsqueezy';
import {
  successResponse,
  badRequestResponse,
  unauthorizedResponse,
  internalErrorResponse,
} from '@/lib/api-response';

export const runtime = 'nodejs';

/**
 * GET /api/billing/lemonsqueezy/portal
 *
 * Returns the Lemon Squeezy customer-portal URL (signed) so the user can update
 * payment details or cancel. App Store subscriptions are managed by Apple and are
 * rejected here. Sibling of app/api/billing/paddle/portal/route.ts.
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { lemonSqueezySubscriptionId: true, entitlementSource: true },
    });

    if (user?.entitlementSource === 'APPLE_IAP') {
      return badRequestResponse('This subscription is managed through the App Store.');
    }
    if (!user?.lemonSqueezySubscriptionId) {
      return badRequestResponse('No active subscription found.');
    }

    const url = await getLemonSqueezyPortalUrl(user.lemonSqueezySubscriptionId);
    if (!url) return badRequestResponse('Could not create a portal session.');
    return successResponse({ url });
  } catch (error) {
    console.error('[GET /api/billing/lemonsqueezy/portal]', error);
    return internalErrorResponse();
  }
}
