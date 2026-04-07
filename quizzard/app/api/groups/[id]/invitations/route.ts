import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  successResponse,
  badRequestResponse,
  unauthorizedResponse,
  forbiddenResponse,
  notFoundResponse,
  internalErrorResponse,
} from '@/lib/api-response';

type RouteContext = { params: Promise<{ id: string }> };

// GET /api/groups/:id/invitations — list pending invitations for the group (owner/admin only)
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: groupId } = await context.params;

    // Verify the requesting user is owner or admin
    const membership = await db.studyGroupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
    });

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return forbiddenResponse('Only the owner or an admin can view invitations');
    }

    const invitations = await db.groupInvitation.findMany({
      where: { groupId, status: 'pending' },
      include: {
        invitee: {
          select: { id: true, name: true, username: true, avatarUrl: true },
        },
        inviter: {
          select: { id: true, name: true, username: true, avatarUrl: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return successResponse(
      invitations.map((inv) => ({
        id: inv.id,
        groupId: inv.groupId,
        status: inv.status,
        createdAt: inv.createdAt,
        invitee: inv.invitee,
        inviter: inv.inviter,
      }))
    );
  } catch {
    return internalErrorResponse();
  }
}

// POST /api/groups/:id/invitations — invite a user to the group (owner/admin only)
export async function POST(request: NextRequest, context: RouteContext) {
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
      return forbiddenResponse('Only the owner or an admin can invite members');
    }

    // Check the group exists
    const group = await db.studyGroup.findUnique({
      where: { id: groupId },
      select: { id: true, name: true },
    });

    if (!group) {
      return notFoundResponse('Group not found');
    }

    // Check the target user exists
    const targetUser = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, username: true },
    });

    if (!targetUser) {
      return notFoundResponse('User not found');
    }

    // Check user is not already an accepted member
    const existingMembership = await db.studyGroupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
    });

    if (existingMembership && existingMembership.status === 'accepted') {
      return badRequestResponse('User is already a member of this group');
    }

    // Check for an existing pending invitation
    const existingInvitation = await db.groupInvitation.findUnique({
      where: { groupId_inviteeId: { groupId, inviteeId: userId } },
    });

    if (existingInvitation && existingInvitation.status === 'pending') {
      return badRequestResponse('A pending invitation already exists for this user');
    }

    // Get inviter info for the notification
    const inviter = await db.user.findUnique({
      where: { id: authUserId },
      select: { name: true, username: true },
    });

    // Create invitation, pending member, and notification atomically
    const [invitation] = await db.$transaction([
      db.groupInvitation.create({
        data: {
          groupId,
          inviterId: authUserId,
          inviteeId: userId,
          status: 'pending',
        },
        include: {
          invitee: {
            select: { id: true, name: true, username: true, avatarUrl: true },
          },
          inviter: {
            select: { id: true, name: true, username: true, avatarUrl: true },
          },
        },
      }),
      // Create or update the member row as pending
      existingMembership
        ? db.studyGroupMember.update({
            where: { groupId_userId: { groupId, userId } },
            data: { status: 'pending', role: 'member' },
          })
        : db.studyGroupMember.create({
            data: {
              groupId,
              userId,
              role: 'member',
              status: 'pending',
            },
          }),
      db.notification.create({
        data: {
          userId,
          type: 'group_invitation',
          data: {
            groupId,
            groupName: group.name,
            inviterId: authUserId,
            inviterName: inviter?.name,
            inviterUsername: inviter?.username,
          },
        },
      }),
    ]);

    return successResponse({
      id: invitation.id,
      groupId: invitation.groupId,
      status: invitation.status,
      createdAt: invitation.createdAt,
      invitee: invitation.invitee,
      inviter: invitation.inviter,
    });
  } catch {
    return internalErrorResponse();
  }
}
