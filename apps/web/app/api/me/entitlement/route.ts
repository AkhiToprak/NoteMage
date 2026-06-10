import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { resolveActiveEntitlement } from '@/lib/entitlement';
import { unauthorizedResponse, notFoundResponse } from '@/lib/api-response';

export const runtime = 'nodejs';

/**
 * GET /api/me/entitlement
 *
 * The single source of truth for a user's paid entitlement, returned in the
 * exact shared `Entitlement` shape (packages/shared/src/bridge.ts). Every shell
 * reads it through the native bridge:
 *   - web   → WebFallbackBridge.getEntitlement (fetches this route)
 *   - iOS   → reconciles the StoreKit view against this server value
 *   - desktop → polls/refetches this after returning from checkout
 *
 * IMPORTANT: returns the BARE Entitlement object (the bridges do
 * `res.json() as Entitlement`), NOT the successResponse envelope used elsewhere.
 */
export async function GET(request: NextRequest) {
  const userId = await getAuthUserId(request);
  if (!userId) return unauthorizedResponse();

  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      tier: true,
      entitlementSource: true,
      subscriptionPeriodEnd: true,
      inGracePeriod: true,
    },
  });
  if (!user) return notFoundResponse('User not found');

  return NextResponse.json(resolveActiveEntitlement(user), {
    headers: { 'Cache-Control': 'no-store' },
  });
}
