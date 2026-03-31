import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import {
  successResponse,
  notFoundResponse,
  internalErrorResponse,
} from '@/lib/api-response';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const { username } = await params;

    const user = await db.user.findUnique({
      where: { username },
      select: {
        id: true,
        username: true,
        name: true,
        bio: true,
        avatarUrl: true,
        createdAt: true,
        _count: {
          select: {
            notebooks: true,
          },
        },
      },
    });

    if (!user) return notFoundResponse('User not found');

    return successResponse(user);
  } catch {
    return internalErrorResponse();
  }
}
