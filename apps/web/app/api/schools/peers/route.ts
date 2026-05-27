import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  successResponse,
  badRequestResponse,
  unauthorizedResponse,
  tooManyRequestsResponse,
  internalErrorResponse,
} from '@/lib/api-response';
import { rateLimit, rateLimitKey } from '@/lib/rate-limit';

/**
 * Onboarding "find classmates" feed. Given a school name, returns up to 10
 * other users at the same school that the caller doesn't already have any
 * kind of friendship with — onboarding is about new connections, so any
 * existing accepted/pending/declined edge filters the row out.
 *
 * Privacy: profiles where `profilePrivate` is true are excluded so users who
 * opted out of discovery aren't surfaced even via the school axis.
 * Soundness: only matches users who finished onboarding — pre-onboarding
 * rows shouldn't have a `school` set anyway, but the filter is defensive.
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const rl = await rateLimit(
      rateLimitKey('school:peers', request, userId),
      30,
      60 * 1000,
    );
    if (!rl.success) {
      return tooManyRequestsResponse('Too many requests.', rl.retryAfterMs);
    }

    const { searchParams } = new URL(request.url);
    const school = (searchParams.get('school') ?? '').trim();
    if (!school || school.length > 100) {
      return badRequestResponse('school is required');
    }

    const friendships = await db.friendship.findMany({
      where: {
        OR: [{ requesterId: userId }, { addresseeId: userId }],
      },
      select: { requesterId: true, addresseeId: true },
    });
    const excludedIds = new Set<string>([userId]);
    for (const f of friendships) {
      excludedIds.add(f.requesterId === userId ? f.addresseeId : f.requesterId);
    }

    const peers = await db.user.findMany({
      where: {
        id: { notIn: Array.from(excludedIds) },
        school: { equals: school, mode: 'insensitive' },
        profilePrivate: false,
        onboardingComplete: true,
      },
      select: {
        id: true,
        username: true,
        name: true,
        avatarUrl: true,
        nameStyle: true,
        equippedTitleId: true,
        equippedFrameId: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    // Shape parity with /api/users/search so the row component can be reused.
    // Excluded edges above means the status is always 'none' for what's left.
    const users = peers.map((u) => ({ ...u, friendshipStatus: 'none' as const }));

    return successResponse({ users });
  } catch {
    return internalErrorResponse();
  }
}
