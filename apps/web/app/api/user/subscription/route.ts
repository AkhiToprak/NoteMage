import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { successResponse, unauthorizedResponse, internalErrorResponse } from '@/lib/api-response';

/** GET — return the caller's current plan info */
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
