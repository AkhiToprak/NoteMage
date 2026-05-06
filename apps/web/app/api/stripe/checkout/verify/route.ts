import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { verifyAndFulfillCheckout } from '@/lib/stripe-fulfillment';
import { successResponse, unauthorizedResponse, internalErrorResponse } from '@/lib/api-response';

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const tier = await verifyAndFulfillCheckout(userId);

    return successResponse({ tier: tier ?? 'FREE' });
  } catch (error) {
    console.error('[POST /api/stripe/checkout/verify]', error);
    return internalErrorResponse();
  }
}
