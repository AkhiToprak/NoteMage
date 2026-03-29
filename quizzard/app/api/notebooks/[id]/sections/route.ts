import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  successResponse,
  createdResponse,
  badRequestResponse,
  unauthorizedResponse,
  notFoundResponse,
  internalErrorResponse,
} from '@/lib/api-response';

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: notebookId } = await params;

    const notebook = await db.notebook.findFirst({
      where: { id: notebookId, userId },
    });
    if (!notebook) return notFoundResponse('Notebook not found');

    const sections = await db.section.findMany({
      where: { notebookId },
      orderBy: { sortOrder: 'asc' },
      include: {
        pages: {
          select: { id: true, title: true, updatedAt: true, sortOrder: true },
          orderBy: { sortOrder: 'asc' },
        },
        flashcardSets: {
          select: { id: true, title: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    return successResponse(sections);
  } catch {
    return internalErrorResponse();
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: notebookId } = await params;

    const notebook = await db.notebook.findFirst({
      where: { id: notebookId, userId },
    });
    if (!notebook) return notFoundResponse('Notebook not found');

    const body = await request.json();
    const { title, parentId } = body;

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return badRequestResponse('Section title cannot be empty');
    }
    if (title.trim().length > 200) {
      return badRequestResponse('Section title must be 200 characters or less');
    }

    if (parentId) {
      const parentSection = await db.section.findFirst({
        where: { id: parentId, notebookId },
      });
      if (!parentSection) return notFoundResponse('Parent section not found in this notebook');
    }

    const maxOrder = await db.section.aggregate({
      where: { notebookId, parentId: parentId || null },
      _max: { sortOrder: true },
    });
    const sortOrder = (maxOrder._max.sortOrder ?? -1) + 1;

    const section = await db.section.create({
      data: {
        notebookId,
        title: title.trim(),
        sortOrder,
        ...(parentId && { parentId }),
      },
    });

    return createdResponse(section);
  } catch {
    return internalErrorResponse();
  }
}
