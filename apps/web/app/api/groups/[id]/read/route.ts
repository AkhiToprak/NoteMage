import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { successResponse, unauthorizedResponse, internalErrorResponse } from '@/lib/api-response';

type RouteContext = { params: Promise<{ id: string }> };

// POST /api/groups/:id/read — mark group as read for the current user
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id } = await context.params;

    await db.studyGroupMember.updateMany({
      where: { groupId: { equals: id }, userId: { equals: userId }, status: 'accepted' },
      data: { lastReadAt: new Date() },
    });

    return successResponse({ read: true });
  } catch {
    return internalErrorResponse();
  }
}
