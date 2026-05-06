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

    const folderId = request.nextUrl.searchParams.get('folderId');
    const where: { userId: string; folderId?: string | null } = { userId };

    if (folderId === 'all') {
      // No folderId filter — return all notebooks
    } else if (!folderId || folderId === 'root') {
      where.folderId = null;
    } else {
      where.folderId = folderId;
    }

    const notebooks = await db.notebook.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: {
        _count: {
          select: { documents: true, sections: true },
        },
        sections: {
          select: {
            _count: { select: { pages: true } },
          },
        },
      },
    });

    // Add total pages count to each notebook
    const enriched = notebooks.map((nb) => {
      const totalPages = nb.sections.reduce((sum, s) => sum + s._count.pages, 0);
      const { sections: _sections, ...rest } = nb;
      return { ...rest, _count: { ...rest._count, pages: totalPages } };
    });

    return successResponse(enriched);
  } catch {
    return internalErrorResponse();
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const body = await request.json();
    const { name, description, subject, color, folderId } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return badRequestResponse('Notebook name is required');
    }
    if (name.trim().length > 100) {
      return badRequestResponse('Notebook name must be 100 characters or less');
    }
    if (description && description.length > 500) {
      return badRequestResponse('Description must be 500 characters or less');
    }
    if (subject && subject.length > 100) {
      return badRequestResponse('Subject must be 100 characters or less');
    }
    if (color && !/^#[0-9a-fA-F]{6}$/.test(color)) {
      return badRequestResponse('Color must be a valid hex color (e.g. #8c52ff)');
    }

    // Validate folderId if provided
    if (folderId) {
      const folder = await db.notebookFolder.findFirst({
        where: { id: folderId, userId },
      });
      if (!folder) return badRequestResponse('Folder not found');
    }

    const notebook = await db.notebook.create({
      data: {
        userId,
        name: name.trim(),
        description: description?.trim() || null,
        subject: subject?.trim() || null,
        color: color || '#8c52ff',
        folderId: folderId || null,
      },
    });

    checkAndUnlockAchievements(userId).catch(console.error);

    return createdResponse(notebook);
  } catch {
    return internalErrorResponse();
  }
}
