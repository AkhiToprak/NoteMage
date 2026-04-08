import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  successResponse,
  createdResponse,
  badRequestResponse,
  unauthorizedResponse,
  internalErrorResponse,
} from '@/lib/api-response';
import { checkAndUnlockAchievements } from '@/lib/achievement-checker';

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const parentId = request.nextUrl.searchParams.get('parentId');
    const where: { userId: string; parentId?: string | null } = { userId };

    if (!parentId || parentId === 'root') {
      where.parentId = null;
    } else {
      where.parentId = parentId;
    }

    const folders = await db.notebookFolder.findMany({
      where,
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: { children: true, notebooks: true },
        },
      },
    });

    return successResponse(folders);
  } catch {
    return internalErrorResponse();
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const body = await request.json();
    const { name, parentId, color } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return badRequestResponse('Folder name is required');
    }
    if (name.trim().length > 100) {
      return badRequestResponse('Folder name must be 100 characters or less');
    }
    if (color && !/^#[0-9a-fA-F]{6}$/.test(color)) {
      return badRequestResponse('Color must be a valid hex color (e.g. #8c52ff)');
    }

    if (parentId) {
      const parent = await db.notebookFolder.findFirst({
        where: { id: parentId, userId },
      });
      if (!parent) return badRequestResponse('Parent folder not found');
    }

    const folder = await db.notebookFolder.create({
      data: {
        userId,
        name: name.trim(),
        parentId: parentId || null,
        color: color || null,
      },
      include: {
        _count: {
          select: { children: true, notebooks: true },
        },
      },
    });

    checkAndUnlockAchievements(userId).catch(console.error);

    return createdResponse(folder);
  } catch {
    return internalErrorResponse();
  }
}
