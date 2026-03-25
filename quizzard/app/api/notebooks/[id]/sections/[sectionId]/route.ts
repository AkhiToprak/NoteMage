import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { deletePageImages } from '@/lib/storage';
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
    if (title !== undefined && title.trim().length > 100) {
      return badRequestResponse('Section title must be 100 characters or less');
    }
    if (sortOrder !== undefined && (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 1_000_000)) {
      return badRequestResponse('sortOrder must be a non-negative integer');
    }
    if (color !== undefined && color && !/^#[0-9a-fA-F]{6}$/.test(color)) {
      return badRequestResponse('Color must be a valid hex color (e.g. #ae89ff)');
    }
    if (parentId !== undefined && parentId !== null && parentId === sectionId) {
      return badRequestResponse('A section cannot be its own parent');
    }
    // Verify parent section belongs to same notebook
    if (parentId !== undefined && parentId !== null) {
      const parent = await db.section.findFirst({
        where: { id: parentId, notebookId },
      });
      if (!parent) return badRequestResponse('Parent section not found in this notebook');
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
      include: {
        pages: { select: { id: true } },
      },
    });
    if (!existing) return notFoundResponse('Section not found');

    // Clean up image files for all pages in this section
    for (const page of existing.pages) {
      await deletePageImages(page.id);
    }
    await db.section.delete({ where: { id: sectionId } });

    return successResponse({ deleted: true });
  } catch {
    return internalErrorResponse();
  }
}
