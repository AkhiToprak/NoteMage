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

type RouteContext = { params: Promise<{ id: string; invitationId: string }> };

// PUT /api/groups/:id/invitations/:invitationId — accept or decline an invitation
export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: groupId, invitationId } = await context.params;
    const body = await request.json();
    const { action } = body;

    if (!action || !['accept', 'decline'].includes(action)) {
      return badRequestResponse('action must be "accept" or "decline"');
    }

    // Find the invitation
    const invitation = await db.groupInvitation.findUnique({
      where: { id: invitationId },
      include: {
        group: { select: { id: true, name: true } },
      },
    });

    if (!invitation || invitation.groupId !== groupId) {
      return notFoundResponse('Invitation not found');
    }

    // Only the invitee can accept or decline
    if (invitation.inviteeId !== userId) {
      return forbiddenResponse('Only the invitee can respond to this invitation');
    }

    if (invitation.status !== 'pending') {
      return badRequestResponse('This invitation has already been responded to');
    }

    if (action === 'accept') {
      // Get the user's name for the system message
      const user = await db.user.findUnique({
        where: { id: userId },
        select: { name: true, username: true },
      });

      const displayName = user?.name || user?.username || 'Someone';

      // Accept: update invitation, update member status, create system message
      await db.$transaction([
        db.groupInvitation.update({
          where: { id: invitationId },
          data: { status: 'accepted' },
        }),
        db.studyGroupMember.update({
          where: { groupId_userId: { groupId, userId } },
          data: { status: 'accepted' },
        }),
        db.groupMessage.create({
          data: {
            groupId,
            senderId: null,
            type: 'system',
            content: `${displayName} joined the group`,
          },
        }),
      ]);

      return successResponse({ status: 'accepted', groupId });
    } else {
      // Decline: update invitation, delete the pending member row
      await db.$transaction([
        db.groupInvitation.update({
          where: { id: invitationId },
          data: { status: 'declined' },
        }),
        db.studyGroupMember.delete({
          where: { groupId_userId: { groupId, userId } },
        }),
      ]);

      return successResponse({ status: 'declined', groupId });
    }
  } catch {
    return internalErrorResponse();
  }
}
