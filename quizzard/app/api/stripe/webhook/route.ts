import { NextRequest, NextResponse } from 'next/server';
import { stripe, tierFromPriceId } from '@/lib/stripe';
import { db } from '@/lib/db';
import type Stripe from 'stripe';

export async function POST(request: NextRequest) {
  const body = await request.text();
  const sig = request.headers.get('stripe-signature');

  if (!sig) {
    return NextResponse.json({ error: 'Missing stripe-signature' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    console.error('[Stripe Webhook] Signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutCompleted(session);
        break;
      }
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpdated(subscription);
        break;
      }
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionDeleted(subscription);
        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        await handlePaymentFailed(invoice);
        break;
      }
      default:
        console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
    }
  } catch (error) {
    console.error(`[Stripe Webhook] Error handling ${event.type}:`, error);
    return NextResponse.json({ error: 'Webhook handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.userId;
  const tier = session.metadata?.tier;
  console.log(
    `[Stripe Webhook] checkout.session.completed — userId=${userId}, tier=${tier}, sessionId=${session.id}`
  );
  if (!userId || !tier) {
    console.error('[Stripe Webhook] Missing metadata on checkout session');
    return;
  }

  const subscriptionId = session.subscription as string;
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const periodEnd = subscription.items.data[0]?.current_period_end;

  await db.user.update({
    where: { id: userId },
    data: {
      tier: tier as 'PLUS' | 'PRO',
      pendingTier: null,
      stripeSubscriptionId: subscriptionId,
      subscriptionPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
    },
  });
  console.log(
    `[Stripe Webhook] Fulfilled tier=${tier} for user=${userId}, subscription=${subscriptionId}`
  );
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const user = await db.user.findFirst({
    where: { stripeSubscriptionId: subscription.id },
    select: { id: true },
  });
  if (!user) return;

  const item = subscription.items.data[0];
  const priceId = item?.price.id;
  const newTier = priceId ? tierFromPriceId(priceId) : null;
  const periodEnd = item?.current_period_end;

  const data: Record<string, unknown> = {
    subscriptionPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
  };

  if (newTier) {
    data.tier = newTier;
    data.pendingTier = null;
  }

  if (subscription.cancel_at_period_end) {
    data.pendingTier = 'FREE';
  }

  await db.user.update({ where: { id: user.id }, data });
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const user = await db.user.findFirst({
    where: { stripeSubscriptionId: subscription.id },
    select: { id: true },
  });
  if (!user) return;

  await db.user.update({
    where: { id: user.id },
    data: {
      tier: 'FREE',
      pendingTier: null,
      stripeSubscriptionId: null,
      subscriptionPeriodEnd: null,
    },
  });
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string;
  const user = await db.user.findFirst({
    where: { stripeCustomerId: customerId },
    select: { id: true, email: true },
  });
  if (!user) return;
  console.warn(`[Stripe] Payment failed for user ${user.id} (${user.email})`);
}
