import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  successResponse,
  unauthorizedResponse,
  forbiddenResponse,
  notFoundResponse,
  internalErrorResponse,
} from '@/lib/api-response';

type RouteContext = { params: Promise<{ id: string; sharedId: string }> };

// DELETE /api/groups/:id/shared/:sharedId — remove shared content
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id, sharedId } = await context.params;

    // Verify membership
    const membership = await db.studyGroupMember.findUnique({
      where: { groupId_userId: { groupId: id, userId } },
    });
    if (!membership || membership.status !== 'accepted') {
      return forbiddenResponse('You are not a member of this group');
    }

    // Find the shared content
    const shared = await db.groupSharedContent.findUnique({
      where: { id: sharedId },
    });
    if (!shared || shared.groupId !== id) {
      return notFoundResponse('Shared content not found');
    }

    // Only the sharer, admin, or owner can delete
    const canDelete =
      shared.sharedById === userId || membership.role === 'owner' || membership.role === 'admin';

    if (!canDelete) {
      return forbiddenResponse('Only the sharer, admin, or owner can remove shared content');
    }

    await db.groupSharedContent.delete({ where: { id: sharedId } });

    return successResponse({ deleted: true });
  } catch {
    return internalErrorResponse();
  }
}
