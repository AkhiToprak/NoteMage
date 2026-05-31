import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { syncLemonSqueezyAfterCheckout } from '@/lib/lemonsqueezy';
import {
  successResponse,
  badRequestResponse,
  unauthorizedResponse,
  forbiddenResponse,
  internalErrorResponse,
} from '@/lib/api-response';

export const runtime = 'nodejs';

/**
 * POST /api/billing/lemonsqueezy/sync  { subscriptionId }
 *
 * Slow-webhook fallback called from the overlay's Checkout.Success handler so the
 * UI can flip to PRO without waiting for the webhook. Verifies the subscription
 * via the LS API, confirms it belongs to the caller, and provisions. Idempotent —
 * safe even once the webhook has already fulfilled. Sibling of
 * app/api/billing/paddle/sync/route.ts.
 *
 * A caller may only sync their OWN subscription: syncLemonSqueezyAfterCheckout
 * returns null when the resolved owner doesn't match (or the subscription can't
 * be fetched), so no PRO is granted and we surface a 403 rather than a misleading
 * success — closes the self-upgrade / @unique-column hijack via a forged id.
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
    if (!tier) return forbiddenResponse('Subscription not found for this account');
    return successResponse({ tier });
  } catch (error) {
    console.error('[POST /api/billing/lemonsqueezy/sync]', error);
    return internalErrorResponse();
  }
}
