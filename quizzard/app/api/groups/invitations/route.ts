import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  successResponse,
  unauthorizedResponse,
  internalErrorResponse,
} from '@/lib/api-response';

// GET /api/groups/invitations — list my pending invitations across all groups
export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const invitations = await db.groupInvitation.findMany({
      where: { inviteeId: userId, status: 'pending' },
      include: {
        group: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
            _count: { select: { members: { where: { status: 'accepted' } } } },
          },
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
        group: {
          id: inv.group.id,
          name: inv.group.name,
          avatarUrl: inv.group.avatarUrl,
          memberCount: inv.group._count.members,
        },
        inviter: inv.inviter,
      }))
    );
  } catch {
    return internalErrorResponse();
  }
}
