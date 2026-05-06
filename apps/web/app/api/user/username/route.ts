import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  successResponse,
  badRequestResponse,
  unauthorizedResponse,
  internalErrorResponse,
} from '@/lib/api-response';
import { validateUserUsername, isPlaceholderUsername } from '@/lib/registration';

/**
 * Set a user's username. Used by the OAuth UsernameStep in the onboarding
 * wizard to replace the `oauth_*` placeholder picked during sign-up.
 *
 * Only callable while the caller is either:
 *   - still mid-onboarding (`onboardingComplete === false`), OR
 *   - still carrying a placeholder `oauth_*` username (defensive — should
 *     never be reachable post-onboarding via the normal flow).
 *
 * Post-onboarding username changes go through the existing profile flow,
 * not this endpoint.
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const body = await request.json().catch(() => ({}));
    const check = validateUserUsername((body as { username?: unknown }).username);
    if (!check.ok) return badRequestResponse(check.reason);
    const username = check.username;

    const currentUser = await db.user.findUnique({
      where: { id: userId },
      select: { username: true, onboardingComplete: true },
    });
    if (!currentUser) return unauthorizedResponse();

    const allowed = !currentUser.onboardingComplete || isPlaceholderUsername(currentUser.username);
    if (!allowed) {
      return badRequestResponse(
        'Username is already set. Change it from profile settings instead.'
      );
    }

    const existing = await db.user.findUnique({
      where: { username },
      select: { id: true },
    });
    if (existing && existing.id !== userId) {
      return badRequestResponse('This username is already taken');
    }

    await db.user.update({
      where: { id: userId },
      data: { username },
    });

    return successResponse({ username });
  } catch (error) {
    console.error('Username update error:', error);
    return internalErrorResponse('Failed to update username');
  }
}
