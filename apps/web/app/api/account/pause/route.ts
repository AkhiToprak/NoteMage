import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { successResponse, forbiddenResponse, badRequestResponse } from '@/lib/api-response';
import { deriveAccountState } from '@/lib/entitlement';

// "Pause my account" from the trial-ended gate. Keeps the user's paths/progress
// safe and locks the account into the paused screen (escapable only by
// subscribing). The 3-month retention clock and hard delete run in the deletion
// sweep (src/lib/account-deletion.ts); resubscribing clears pausedAt via activeGrant().
export async function POST(request: NextRequest) {
  const userId = await getAuthUserId(request);
  if (!userId) return forbiddenResponse('Authentication required');

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { tier: true, entitlementSource: true, trialEndsAt: true, pausedAt: true },
  });
  if (!user) return forbiddenResponse('Authentication required');

  const state = deriveAccountState(user);
  if (state === 'paused') return successResponse({ paused: true }); // idempotent
  // Only a lapsed/expired account can pause. Active, comped, and still-trialing
  // accounts have nothing to pause and must never lock themselves out.
  if (state !== 'expired') return badRequestResponse('Account is not eligible to pause');

  await db.user.update({ where: { id: userId }, data: { pausedAt: new Date() } });
  return successResponse({ paused: true });
}
