import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  successResponse,
  badRequestResponse,
  unauthorizedResponse,
  notFoundResponse,
  internalErrorResponse,
} from '@/lib/api-response';

type Params = { params: Promise<{ id: string; sectionId: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: notebookId, sectionId } = await params;

    const section = await db.section.findFirst({
      where: {
        id: sectionId,
        notebookId,
        notebook: { userId },
      },
      include: {
        pages: { orderBy: { sortOrder: 'asc' } },
        children: { orderBy: { sortOrder: 'asc' } },
      },
    });

    if (!section) return notFoundResponse('Section not found');

    return successResponse(section);
  } catch {
    return internalErrorResponse();
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: notebookId, sectionId } = await params;

    const existing = await db.section.findFirst({
      where: {
        id: sectionId,
        notebookId,
        notebook: { userId },
      },
    });
    if (!existing) return notFoundResponse('Section not found');

    const body = await request.json();
    const { title, sortOrder, color, parentId } = body;

    if (title !== undefined && (typeof title !== 'string' || title.trim().length === 0)) {
      return badRequestResponse('Section title cannot be empty');
    }

    const updated = await db.section.update({
      where: { id: sectionId },
      data: {
        ...(title !== undefined && { title: title.trim() }),
        ...(sortOrder !== undefined && { sortOrder }),
        ...(color !== undefined && { color }),
        ...(parentId !== undefined && { parentId: parentId || null }),
      },
    });

    return successResponse(updated);
  } catch {
    return internalErrorResponse();
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: notebookId, sectionId } = await params;

    const existing = await db.section.findFirst({
      where: {
        id: sectionId,
        notebookId,
        notebook: { userId },
      },
    });
    if (!existing) return notFoundResponse('Section not found');

    await db.section.delete({ where: { id: sectionId } });

    return successResponse({ deleted: true });
  } catch {
    return internalErrorResponse();
  }
}
