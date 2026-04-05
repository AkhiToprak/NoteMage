import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  successResponse,
  notFoundResponse,
  internalErrorResponse,
} from '@/lib/api-response';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const { username } = await params;

    const user = await db.user.findUnique({
      where: { username },
      select: {
        id: true,
        username: true,
        name: true,
        bio: true,
        avatarUrl: true,
        createdAt: true,
        _count: {
          select: {
            notebooks: true,
          },
        },
      },
    });

    if (!user) return notFoundResponse('User not found');

    // Determine friendship status if viewer is authenticated
    let friendshipStatus: string | null = null;
    const viewerId = await getAuthUserId(request);
    if (viewerId && viewerId !== user.id) {
      const friendship = await db.friendship.findFirst({
        where: {
          OR: [
            { requesterId: viewerId, addresseeId: user.id },
            { requesterId: user.id, addresseeId: viewerId },
          ],
        },
        select: { status: true, requesterId: true },
      });

      if (!friendship) {
        friendshipStatus = 'none';
      } else if (friendship.status === 'accepted') {
        friendshipStatus = 'accepted';
      } else if (friendship.status === 'pending') {
        friendshipStatus = friendship.requesterId === viewerId ? 'pending_sent' : 'pending_received';
      } else if (friendship.status === 'declined') {
        friendshipStatus = 'none';
      }
    }

    return successResponse({ ...user, friendshipStatus });
  } catch {
    return internalErrorResponse();
  }
}
