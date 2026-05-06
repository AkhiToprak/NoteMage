import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  successResponse,
  createdResponse,
  badRequestResponse,
  unauthorizedResponse,
  forbiddenResponse,
  notFoundResponse,
  conflictResponse,
  internalErrorResponse,
} from '@/lib/api-response';

// POST /api/groups/:id/members — add a member (owner/admin only, must be friends)
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const authUserId = await getAuthUserId(request);
    if (!authUserId) return unauthorizedResponse();

    const { id: groupId } = await context.params;
    const body = await request.json();
    const { userId } = body;

    if (!userId || typeof userId !== 'string') {
      return badRequestResponse('userId is required');
    }

    // Verify the requesting user is owner or admin
    const requesterMembership = await db.studyGroupMember.findUnique({
      where: { groupId_userId: { groupId, userId: authUserId } },
    });

    if (!requesterMembership || !['owner', 'admin'].includes(requesterMembership.role)) {
      return forbiddenResponse('Only the owner or an admin can add members');
    }

    // Check the group exists
    const group = await db.studyGroup.findUnique({
      where: { id: groupId },
      select: { id: true },
    });

    if (!group) {
      return notFoundResponse('Group not found');
    }

    // Check user is not already a member
    const existingMembership = await db.studyGroupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
    });

    if (existingMembership) {
      return conflictResponse('User is already a member of this group');
    }

    // Check the target user is a friend of the requesting user
    const friendship = await db.friendship.findFirst({
      where: {
        status: 'accepted',
        OR: [
          { requesterId: authUserId, addresseeId: userId },
          { requesterId: userId, addresseeId: authUserId },
        ],
      },
    });

    if (!friendship) {
      return badRequestResponse('You can only add friends to a group');
    }

    // Check the target user exists
    const targetUser = await db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        username: true,
        avatarUrl: true,
        nameStyle: true,
        equippedTitleId: true,
        equippedFrameId: true,
      },
    });

    if (!targetUser) {
      return notFoundResponse('User not found');
    }

    const member = await db.studyGroupMember.create({
      data: {
        groupId,
        userId,
        role: 'member',
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            username: true,
            avatarUrl: true,
            nameStyle: true,
            equippedTitleId: true,
            equippedFrameId: true,
          },
        },
      },
    });

    return createdResponse({
      id: member.id,
      userId: member.user.id,
      name: member.user.name,
      username: member.user.username,
      avatarUrl: member.user.avatarUrl,
      role: member.role,
      joinedAt: member.joinedAt,
    });
  } catch {
    return internalErrorResponse();
  }
}

// DELETE /api/groups/:id/members — remove a member or leave the group
export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const authUserId = await getAuthUserId(request);
    if (!authUserId) return unauthorizedResponse();

    const { id: groupId } = await context.params;
    const body = await request.json();
    const { userId } = body;

    if (!userId || typeof userId !== 'string') {
      return badRequestResponse('userId is required');
    }

    // Get the requesting user's membership
    const requesterMembership = await db.studyGroupMember.findUnique({
      where: { groupId_userId: { groupId, userId: authUserId } },
    });

    if (!requesterMembership) {
      return forbiddenResponse('You are not a member of this group');
    }

    // Get the target user's membership
    const targetMembership = await db.studyGroupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
    });

    if (!targetMembership) {
      return notFoundResponse('User is not a member of this group');
    }

    const isSelf = authUserId === userId;
    const requesterRole = requesterMembership.role;
    const targetRole = targetMembership.role;

    // Owner cannot leave — must delete the group instead
    if (isSelf && targetRole === 'owner') {
      return badRequestResponse('Owner cannot leave the group. Delete the group instead.');
    }

    // Permission checks for removing others
    if (!isSelf) {
      if (requesterRole === 'member') {
        return forbiddenResponse('Members cannot remove other members');
      }
      if (requesterRole === 'admin' && targetRole !== 'member') {
        return forbiddenResponse('Admins can only remove members, not other admins or the owner');
      }
      // Owner can remove anyone
    }

    await db.studyGroupMember.delete({
      where: { groupId_userId: { groupId, userId } },
    });

    return successResponse({ removed: true, userId });
  } catch {
    return internalErrorResponse();
  }
}
