import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  successResponse,
  badRequestResponse,
  unauthorizedResponse,
  internalErrorResponse,
} from '@/lib/api-response';

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'accepted';
    const direction = searchParams.get('direction'); // "incoming" | "outgoing"

    if (!['accepted', 'pending'].includes(status)) {
      return badRequestResponse('Invalid status parameter');
    }

    const userSelect = { id: true, username: true, name: true, avatarUrl: true };

    if (status === 'accepted') {
      const friendships = await db.friendship.findMany({
        where: {
          status: 'accepted',
          OR: [{ requesterId: userId }, { addresseeId: userId }],
        },
        include: {
          requester: { select: userSelect },
          addressee: { select: userSelect },
        },
        orderBy: { updatedAt: 'desc' },
        take: 100,
      });

      const friends = friendships.map((f) => {
        const friend = f.requesterId === userId ? f.addressee : f.requester;
        return {
          friendshipId: f.id,
          ...friend,
        };
      });

      return successResponse({ friends, count: friends.length });
    }

    if (status === 'pending') {
      const where =
        direction === 'outgoing'
          ? { requesterId: userId, status: 'pending' }
          : direction === 'incoming'
            ? { addresseeId: userId, status: 'pending' }
            : {
                status: 'pending',
                OR: [{ requesterId: userId }, { addresseeId: userId }],
              };

      const friendships = await db.friendship.findMany({
        where,
        include: {
          requester: { select: userSelect },
          addressee: { select: userSelect },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });

      const requests = friendships.map((f) => ({
        friendshipId: f.id,
        direction: f.requesterId === userId ? 'outgoing' : 'incoming',
        user: f.requesterId === userId ? f.addressee : f.requester,
        createdAt: f.createdAt,
      }));

      return successResponse({ requests, count: requests.length });
    }

    return successResponse({ friends: [], count: 0 });
  } catch {
    return internalErrorResponse();
  }
}
