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

const VALID_PAID_TIERS = ['PLUS', 'PRO'] as const;
type PaidTier = (typeof VALID_PAID_TIERS)[number];

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const body = await request.json();
    const { tier } = body;

    if (!tier || !VALID_PAID_TIERS.includes(tier as PaidTier)) {
      return badRequestResponse('Invalid tier. Must be PLUS or PRO.');
    }

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, stripeCustomerId: true },
    });
    if (!user) return unauthorizedResponse();

    // Create or reuse Stripe customer
    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { userId: user.id },
      });
      customerId = customer.id;
      await db.user.update({
        where: { id: userId },
        data: { stripeCustomerId: customerId },
      });
    }

    const priceId = TIER_PRICE_MAP[tier as PaidTier];

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      ui_mode: 'embedded_page',
      allow_promotion_codes: true,
      return_url: `${request.nextUrl.origin}/auth/register?payment_success=true&session_id={CHECKOUT_SESSION_ID}`,
      metadata: { userId: user.id, tier },
    });

    return successResponse({ clientSecret: session.client_secret });
  } catch (error) {
    console.error('[POST /api/stripe/checkout]', error);
    return internalErrorResponse();
  }
}
