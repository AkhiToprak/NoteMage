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
import { createSystemMessage } from '@/lib/group-messages';

type RouteContext = { params: Promise<{ id: string }> };

// POST /api/groups/:id/transfer — transfer ownership
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id } = await context.params;

    // Verify the caller is the current owner
    const group = await db.studyGroup.findUnique({
      where: { id },
      select: { ownerId: true },
    });
    if (!group) return notFoundResponse('Group not found');
    if (group.ownerId !== userId) {
      return forbiddenResponse('Only the owner can transfer ownership');
    }

    const body = await request.json();
    const { newOwnerId } = body;

    if (!newOwnerId || typeof newOwnerId !== 'string') {
      return badRequestResponse('New owner ID is required');
    }
    if (newOwnerId === userId) {
      return badRequestResponse('You are already the owner');
    }

    // Verify new owner is an accepted member
    const newOwnerMembership = await db.studyGroupMember.findUnique({
      where: { groupId_userId: { groupId: id, userId: newOwnerId } },
    });
    if (!newOwnerMembership || newOwnerMembership.status !== 'accepted') {
      return badRequestResponse('New owner must be an accepted member');
    }

    // Look up names for system message
    const [oldOwner, newOwner] = await Promise.all([
      db.user.findUnique({ where: { id: userId }, select: { name: true, username: true } }),
      db.user.findUnique({ where: { id: newOwnerId }, select: { name: true, username: true } }),
    ]);

    // Execute transfer in a transaction
    await db.$transaction([
      db.studyGroup.update({ where: { id }, data: { ownerId: newOwnerId } }),
      db.studyGroupMember.update({
        where: { groupId_userId: { groupId: id, userId } },
        data: { role: 'admin' },
      }),
      db.studyGroupMember.update({
        where: { groupId_userId: { groupId: id, userId: newOwnerId } },
        data: { role: 'owner' },
      }),
    ]);

    const oldName = oldOwner?.name || oldOwner?.username || 'Someone';
    const newName = newOwner?.name || newOwner?.username || 'Someone';
    await createSystemMessage(id, `${oldName} transferred ownership to ${newName}`);

    return successResponse({ transferred: true, newOwnerId });
  } catch {
    return internalErrorResponse();
  }
}
