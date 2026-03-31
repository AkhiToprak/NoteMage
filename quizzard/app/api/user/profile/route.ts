import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  successResponse,
  badRequestResponse,
  unauthorizedResponse,
  internalErrorResponse,
} from '@/lib/api-response';

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        name: true,
        bio: true,
        avatarUrl: true,
        dailyGoal: true,
        createdAt: true,
        _count: {
          select: {
            notebooks: true,
            chatMessages: true,
          },
        },
      },
    });

    if (!user) return unauthorizedResponse();

    const flashcardSetCount = await db.flashcardSet.count({
      where: { notebook: { userId } },
    });

    return successResponse({
      ...user,
      flashcardSetCount,
    });
  } catch {
    return internalErrorResponse();
  }
}

export async function PUT(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const body = await request.json();
    const { name, bio, dailyGoal } = body;

    const data: Record<string, unknown> = {};

    if (name !== undefined) {
      if (typeof name !== 'string' || name.length > 100) {
        return badRequestResponse('Name must be a string of at most 100 characters');
      }
      data.name = name.trim() || null;
    }

    if (bio !== undefined) {
      if (typeof bio !== 'string' || bio.length > 160) {
        return badRequestResponse('Bio must be a string of at most 160 characters');
      }
      data.bio = bio.trim() || null;
    }

    if (dailyGoal !== undefined) {
      if (typeof dailyGoal !== 'number' || dailyGoal < 1 || dailyGoal > 200) {
        return badRequestResponse('dailyGoal must be a number between 1 and 200');
      }
      data.dailyGoal = Math.round(dailyGoal);
    }

    if (Object.keys(data).length === 0) {
      return badRequestResponse('No valid fields to update');
    }

    const updated = await db.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        username: true,
        name: true,
        bio: true,
        avatarUrl: true,
        dailyGoal: true,
        createdAt: true,
      },
    });

    return successResponse(updated);
  } catch {
    return internalErrorResponse();
  }
}
