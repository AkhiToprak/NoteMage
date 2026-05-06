import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  createdResponse,
  badRequestResponse,
  unauthorizedResponse,
  notFoundResponse,
  successResponse,
  tooManyRequestsResponse,
  internalErrorResponse,
} from '@/lib/api-response';
import { rateLimit, rateLimitKey } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    // Rate limit: 20 friend requests per 10 minutes per user
    const rl = await rateLimit(rateLimitKey('friend:request', request, userId), 20, 10 * 60 * 1000);
    if (!rl.success)
      return tooManyRequestsResponse(
        'Too many friend requests. Please slow down.',
        rl.retryAfterMs
      );

    const body = await request.json().catch(() => ({}));
    const { username, userId: targetUserId } = body as {
      username?: string;
      userId?: string;
    };

    if (!username && !targetUserId) {
      return badRequestResponse('username or userId is required');
    }

    // Look up addressee
    const addressee = targetUserId
      ? await db.user.findUnique({
          where: { id: targetUserId },
          select: {
            id: true,
            username: true,
            avatarUrl: true,
            name: true,
            nameStyle: true,
            equippedTitleId: true,
            equippedFrameId: true,
          },
        })
      : await db.user.findFirst({
          where: { username: { equals: String(username), mode: 'insensitive' } },
          select: {
            id: true,
            username: true,
            avatarUrl: true,
            name: true,
            nameStyle: true,
            equippedTitleId: true,
            equippedFrameId: true,
          },
        });

    if (!addressee) {
      return notFoundResponse('User not found');
    }

    // Cannot friend yourself
    if (addressee.id === userId) {
      return badRequestResponse('You cannot send a friend request to yourself');
    }

    // Check existing friendships in both directions
    const existing = await db.friendship.findFirst({
      where: {
        OR: [
          { requesterId: userId, addresseeId: addressee.id },
          { requesterId: addressee.id, addresseeId: userId },
        ],
      },
    });

    if (existing) {
      if (existing.status === 'accepted') {
        return badRequestResponse('You are already friends');
      }
      if (existing.status === 'pending') {
        // If reverse request exists (B sent to A, and now A sends to B), auto-accept
        if (existing.requesterId === addressee.id && existing.addresseeId === userId) {
          const updated = await db.friendship.update({
            where: { id: existing.id },
            data: { status: 'accepted' },
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
              addressee: {
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

          // Notify both parties
          await db.notification.create({
            data: {
              userId: addressee.id,
              type: 'friend_accepted',
              data: {
                friendshipId: updated.id,
                userId,
                username: (
                  await db.user.findUnique({ where: { id: userId }, select: { username: true } })
                )?.username,
              },
            },
          });

          return successResponse({
            friendship: {
              id: updated.id,
              status: 'accepted',
              autoAccepted: true,
              addressee: {
                id: addressee.id,
                username: addressee.username,
                avatarUrl: addressee.avatarUrl,
              },
            },
          });
        }
        return badRequestResponse('A pending friend request already exists');
      }
      if (existing.status === 'declined') {
        // Enforce 24h cooldown after decline
        const cooldownMs = 24 * 60 * 60 * 1000;
        if (Date.now() - existing.updatedAt.getTime() < cooldownMs) {
          return badRequestResponse('Please wait before sending another request');
        }
        // Allow re-requesting after decline — update the existing record
        const updated = await db.friendship.update({
          where: { id: existing.id },
          data: {
            requesterId: userId,
            addresseeId: addressee.id,
            status: 'pending',
          },
          include: {
            addressee: {
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

        await db.notification.create({
          data: {
            userId: addressee.id,
            type: 'friend_request',
            data: {
              friendshipId: updated.id,
              userId,
              username: (
                await db.user.findUnique({ where: { id: userId }, select: { username: true } })
              )?.username,
            },
          },
        });

        return createdResponse({
          friendship: {
            id: updated.id,
            status: 'pending',
            addressee: {
              id: addressee.id,
              username: addressee.username,
              avatarUrl: addressee.avatarUrl,
            },
          },
        });
      }
    }

    // Create new friendship + notification in a transaction to prevent races
    const { friendship, requesterUsername } = await db.$transaction(async (tx) => {
      const f = await tx.friendship.create({
        data: {
          requesterId: userId,
          addresseeId: addressee.id,
          status: 'pending',
        },
        include: {
          addressee: { select: { id: true, username: true, avatarUrl: true } },
        },
      });

      const req = await tx.user.findUnique({
        where: { id: userId },
        select: { username: true },
      });

      await tx.notification.create({
        data: {
          userId: addressee.id,
          type: 'friend_request',
          data: { friendshipId: f.id, userId, username: req?.username },
        },
      });

      return { friendship: f, requesterUsername: req?.username };
    });

    return createdResponse({
      friendship: {
        id: friendship.id,
        status: 'pending',
        addressee: {
          id: addressee.id,
          username: addressee.username,
          avatarUrl: addressee.avatarUrl,
        },
      },
    });
  } catch {
    return internalErrorResponse();
  }
}
