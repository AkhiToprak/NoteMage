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

// PUT /api/groups/:id/role — change member role
export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id } = await context.params;

    // Only the owner can change roles
    const group = await db.studyGroup.findUnique({
      where: { id },
      select: { ownerId: true },
    });
    if (!group) return notFoundResponse('Group not found');
    // Owner or teacher can change roles
    const callerMembership = await db.studyGroupMember.findUnique({
      where: { groupId_userId: { groupId: id, userId } },
    });
    if (!callerMembership || !['owner', 'teacher'].includes(callerMembership.role)) {
      return forbiddenResponse('Only the owner or teacher can change member roles');
    }

    const body = await request.json();
    const { userId: targetUserId, role } = body;

    if (!targetUserId || typeof targetUserId !== 'string') {
      return badRequestResponse('User ID is required');
    }
    if (!role || !['admin', 'teacher', 'member'].includes(role)) {
      return badRequestResponse('Role must be "admin", "teacher", or "member"');
    }
    if (targetUserId === userId) {
      return badRequestResponse('You cannot change your own role');
    }

    // Find the target membership
    const targetMembership = await db.studyGroupMember.findUnique({
      where: { groupId_userId: { groupId: id, userId: targetUserId } },
    });
    if (!targetMembership || targetMembership.status !== 'accepted') {
      return notFoundResponse('Member not found');
    }

    const updated = await db.studyGroupMember.update({
      where: { groupId_userId: { groupId: id, userId: targetUserId } },
      data: { role },
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

    return successResponse({
      id: updated.id,
      userId: updated.user.id,
      name: updated.user.name,
      username: updated.user.username,
      avatarUrl: updated.user.avatarUrl,
      role: updated.role,
      joinedAt: updated.joinedAt,
    });
  } catch {
    return internalErrorResponse();
  }
}
