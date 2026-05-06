import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  successResponse,
  badRequestResponse,
  unauthorizedResponse,
  notFoundResponse,
  forbiddenResponse,
  internalErrorResponse,
} from '@/lib/api-response';
import { checkAndUnlockAchievements } from '@/lib/achievement-checker';

// PUT — accept/decline a friend request
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id } = await params;

    const body = await request.json().catch(() => ({}));
    const { action } = body as { action?: string };

    if (action !== 'accept' && action !== 'decline') {
      return badRequestResponse('action must be "accept" or "decline"');
    }

    const friendship = await db.friendship.findUnique({
      where: { id },
      include: {
        requester: {
          select: {
            id: true,
            username: true,
            name: true,
            avatarUrl: true,
            nameStyle: true,
            equippedTitleId: true,
            equippedFrameId: true,
          },
        },
      },
    });

    if (!friendship) {
      return notFoundResponse('Friend request not found');
    }

    // Only the addressee can accept/decline
    if (friendship.addresseeId !== userId) {
      return forbiddenResponse('Only the recipient can respond to this request');
    }

    if (friendship.status !== 'pending') {
      return badRequestResponse('This request is no longer pending');
    }

    const updated = await db.friendship.update({
      where: { id },
      data: { status: action === 'accept' ? 'accepted' : 'declined' },
    });

    if (action === 'accept') {
      // Notify the requester
      const addressee = await db.user.findUnique({
        where: { id: userId },
        select: { username: true },
      });

      await db.notification.create({
        data: {
          userId: friendship.requesterId,
          type: 'friend_accepted',
          data: {
            friendshipId: id,
            userId,
            username: addressee?.username,
          },
        },
      });

      // Check friend-related achievements for both users
      checkAndUnlockAchievements(userId).catch(console.error);
      checkAndUnlockAchievements(friendship.requesterId).catch(console.error);
    }

    return successResponse({
      friendship: {
        id: updated.id,
        status: updated.status,
        requester: friendship.requester,
      },
    });
  } catch {
    return internalErrorResponse();
  }
}

// DELETE — cancel a pending request (requester only)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id } = await params;

    const friendship = await db.friendship.findUnique({ where: { id } });

    if (!friendship) {
      return notFoundResponse('Friend request not found');
    }

    // Only the requester can cancel
    if (friendship.requesterId !== userId) {
      return forbiddenResponse('Only the sender can cancel this request');
    }

    if (friendship.status !== 'pending') {
      return badRequestResponse('This request is no longer pending');
    }

    await db.friendship.delete({ where: { id } });

    return successResponse({ deleted: true });
  } catch {
    return internalErrorResponse();
  }
}
