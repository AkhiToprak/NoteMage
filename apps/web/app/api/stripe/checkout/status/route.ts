import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { stripe } from '@/lib/stripe';
import {
  successResponse,
  badRequestResponse,
  unauthorizedResponse,
  internalErrorResponse,
} from '@/lib/api-response';

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const sessionId = request.nextUrl.searchParams.get('session_id');
    if (!sessionId) return badRequestResponse('session_id is required');

    const session = await stripe.checkout.sessions.retrieve(sessionId);

    // Verify this session belongs to the requesting user
    if (session.metadata?.userId !== userId) {
      return unauthorizedResponse('Session does not belong to this user.');
    }

    return successResponse({
      status: session.status,
      paymentStatus: session.payment_status,
    });
  } catch (error) {
    console.error('[GET /api/stripe/checkout/status]', error);
    return internalErrorResponse();
  }
}
