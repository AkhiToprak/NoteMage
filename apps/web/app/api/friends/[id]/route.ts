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

// DELETE — unfriend (user must be requester or addressee)
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
      return notFoundResponse('Friendship not found');
    }

    if (friendship.requesterId !== userId && friendship.addresseeId !== userId) {
      return forbiddenResponse('You are not part of this friendship');
    }

    if (friendship.status !== 'accepted') {
      return badRequestResponse('Can only unfriend accepted friendships');
    }

    await db.friendship.delete({ where: { id } });

    return successResponse({ deleted: true });
  } catch {
    return internalErrorResponse();
  }
}
