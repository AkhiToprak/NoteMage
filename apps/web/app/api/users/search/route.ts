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

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    // Rate limit: 30 searches per minute per user
    const rl = await rateLimit(rateLimitKey('user:search', request, userId), 30, 60 * 1000);
    if (!rl.success) return tooManyRequestsResponse('Too many search requests.', rl.retryAfterMs);

    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q')?.trim();

    if (!q || q.length < 2) {
      return badRequestResponse('Search query must be at least 2 characters');
    }

    // Limit query length
    const query = q.slice(0, 50);

    // Search by username (case-insensitive contains), exclude self, limit 20
    const users = await db.user.findMany({
      where: {
        id: { not: userId },
        username: { contains: query, mode: 'insensitive' },
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
      take: 20,
    });

    // Get friendship status for each found user
    const userIds = users.map((u) => u.id);
    const friendships = await db.friendship.findMany({
      where: {
        OR: [
          { requesterId: userId, addresseeId: { in: userIds } },
          { requesterId: { in: userIds }, addresseeId: userId },
        ],
      },
    });

    const friendshipMap = new Map<string, { status: string; requesterId: string }>();
    for (const f of friendships) {
      const otherId = f.requesterId === userId ? f.addresseeId : f.requesterId;
      friendshipMap.set(otherId, { status: f.status, requesterId: f.requesterId });
    }

    const results = users.map((u) => {
      const f = friendshipMap.get(u.id);
      let friendshipStatus: string = 'none';
      if (f) {
        if (f.status === 'accepted') friendshipStatus = 'accepted';
        else if (f.status === 'pending') {
          friendshipStatus = f.requesterId === userId ? 'pending_sent' : 'pending_received';
        }
        // declined treated as 'none' so user can re-request
      }
      return { ...u, friendshipStatus };
    });

    return successResponse({ users: results });
  } catch {
    return internalErrorResponse();
  }
}
