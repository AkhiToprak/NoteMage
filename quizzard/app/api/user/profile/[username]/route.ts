import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  successResponse,
  unauthorizedResponse,
  tooManyRequestsResponse,
  notFoundResponse,
  internalErrorResponse,
} from '@/lib/api-response';
import { rateLimit, rateLimitKey } from '@/lib/rate-limit';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const viewerId = await getAuthUserId(request);
    if (!viewerId) return unauthorizedResponse();

    // Rate limit: 30 profile views per minute per user
    const rl = await rateLimit(rateLimitKey('profile:view', request, viewerId), 30, 60 * 1000);
    if (!rl.success) return tooManyRequestsResponse('Too many requests.', rl.retryAfterMs);

    const { username } = await params;

    const user = await db.user.findFirst({
      where: { username: { equals: username, mode: 'insensitive' } },
      select: {
        id: true,
        username: true,
        name: true,
        bio: true,
        avatarUrl: true,
        age: true,
        location: true,
        school: true,
        lineOfWork: true,
        profilePrivate: true,
        hideAchievements: true,
        createdAt: true,
        nameStyle: true,
        equippedTitleId: true,
        equippedFrameId: true,
        equippedBackgroundId: true,
        customBackgroundUrl: true,
      },
    });

    if (!user) return notFoundResponse('User not found');

    // The public showcase row renders the slugs the target user has earned.
    // We return the raw slug list — the catalog on the client knows everything
    // else (label, type, required level). No sensitive data, so it's safe to
    // include even for non-friends of public profiles.
    const unlocks = await db.userCosmetic.findMany({
      where: { userId: user.id },
      select: { cosmeticId: true },
      orderBy: { unlockedAt: 'desc' },
    });
    const unlockedCosmeticIds = unlocks.map((row) => row.cosmeticId);

    const isOwnProfile = viewerId === user.id;
    let friendshipStatus: string | null = null;
    let friendshipId: string | null = null;

    if (!isOwnProfile) {
      const friendship = await db.friendship.findFirst({
        where: {
          OR: [
            { requesterId: viewerId, addresseeId: user.id },
            { requesterId: user.id, addresseeId: viewerId },
          ],
        },
        select: { id: true, status: true, requesterId: true },
      });

      if (!friendship) {
        friendshipStatus = 'none';
      } else if (friendship.status === 'accepted') {
        friendshipStatus = 'accepted';
        friendshipId = friendship.id;
      } else if (friendship.status === 'pending') {
        friendshipStatus =
          friendship.requesterId === viewerId ? 'pending_sent' : 'pending_received';
        friendshipId = friendship.id;
      } else if (friendship.status === 'declined') {
        friendshipStatus = 'none';
      }
    }

    const isFriend = friendshipStatus === 'accepted';

    // Private profile: only show limited info to non-friends.
    // Cosmetic styling (name font/color, equipped title/frame) is public —
    // it still paints the name in the header even when the rest of the
    // profile is hidden.
    if (user.profilePrivate && !isFriend && !isOwnProfile) {
      return successResponse({
        id: user.id,
        username: user.username,
        name: user.name,
        avatarUrl: user.avatarUrl,
        createdAt: user.createdAt,
        profilePrivate: true,
        nameStyle: user.nameStyle,
        equippedTitleId: user.equippedTitleId,
        equippedFrameId: user.equippedFrameId,
        equippedBackgroundId: user.equippedBackgroundId,
        customBackgroundUrl: user.customBackgroundUrl,
        unlockedCosmeticIds,
        friendshipStatus,
        friendshipId,
      });
    }

    return successResponse({
      ...user,
      unlockedCosmeticIds,
      friendshipStatus,
      friendshipId,
    });
  } catch {
    return internalErrorResponse();
  }
}
