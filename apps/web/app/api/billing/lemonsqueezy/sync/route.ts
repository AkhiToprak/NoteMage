import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { syncLemonSqueezyAfterCheckout } from '@/lib/lemonsqueezy';
import {
  successResponse,
  badRequestResponse,
  unauthorizedResponse,
  internalErrorResponse,
} from '@/lib/api-response';

export const runtime = 'nodejs';

/**
 * POST /api/billing/lemonsqueezy/sync  { subscriptionId }
 *
 * Slow-webhook fallback called from the overlay's Checkout.Success handler so the
 * UI can flip to PRO without waiting for the webhook. Verifies the subscription
 * via the LS API and provisions. Idempotent — safe even once the webhook has
 * already fulfilled. Sibling of app/api/billing/paddle/sync/route.ts.
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const body = (await request.json().catch(() => null)) as { subscriptionId?: unknown } | null;
    const subscriptionId = body?.subscriptionId;
    if (typeof subscriptionId !== 'string' || !subscriptionId) {
      return badRequestResponse('subscriptionId is required');
    }

    const tier = await syncLemonSqueezyAfterCheckout({ userId, subscriptionId });
    return successResponse({ tier });
  } catch (error) {
    console.error('[POST /api/billing/lemonsqueezy/sync]', error);
    return internalErrorResponse();
  }
}
