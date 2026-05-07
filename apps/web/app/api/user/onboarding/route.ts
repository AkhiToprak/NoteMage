import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  successResponse,
  badRequestResponse,
  unauthorizedResponse,
  internalErrorResponse,
} from '@/lib/api-response';
import { sendSignupNotification } from '@/lib/email';
import { verifyAndFulfillCheckout } from '@/lib/stripe-fulfillment';
import { validateGoals } from '../study-goals/route';

export async function PUT(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    // Prevent replay — onboarding can only be completed once
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { onboardingComplete: true },
    });
    if (user?.onboardingComplete) {
      return badRequestResponse('Onboarding already completed');
    }

    const body = await request.json().catch(() => ({}));
    const { goals = {}, scholarName } = body as {
      goals?: unknown;
      scholarName?: string | null;
    };

    if (scholarName !== undefined && scholarName !== null) {
      if (typeof scholarName !== 'string' || scholarName.trim().length > 30) {
        return badRequestResponse('Mage name must be at most 30 characters');
      }
    }

    const validated = validateGoals(goals);
    if (!validated.ok) return badRequestResponse(validated.error);

    await db.user.update({
      where: { id: userId },
      data: {
        onboardingComplete: true,
        ...(scholarName ? { scholarName: scholarName.trim() } : {}),
        ...validated.data,
      },
    });

    // Read user AFTER update for freshest tier.
    // If tier is still FREE, verify directly with Stripe (fallback if webhook hasn't arrived).
    let fullUser = await db.user.findUnique({
      where: { id: userId },
      select: { email: true, tier: true },
    });

    if (fullUser && fullUser.tier === 'FREE') {
      const verifiedTier = await verifyAndFulfillCheckout(userId);
      if (verifiedTier && verifiedTier !== 'FREE') {
        fullUser = { ...fullUser, tier: verifiedTier };
      }
    }

    if (fullUser?.email) {
      sendSignupNotification(fullUser.email, fullUser.tier);
    }

    return successResponse({ success: true });
  } catch {
    return internalErrorResponse();
  }
}
