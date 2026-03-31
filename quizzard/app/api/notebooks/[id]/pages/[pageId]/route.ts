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
import { recordActivity } from '@/lib/activity';

type Params = { params: Promise<{ id: string; pageId: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: notebookId, pageId } = await params;

    const page = await db.page.findFirst({
      where: {
        id: pageId,
        section: {
          notebookId,
          notebook: { userId },
        },
      },
      include: { images: true },
    });

    if (!page) return notFoundResponse('Page not found');

    return successResponse(page);
  } catch {
    return internalErrorResponse();
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: notebookId, pageId } = await params;

    // Record activity (fire-and-forget)
    recordActivity(userId, 'page_edit').catch(() => {});

    const existing = await db.page.findFirst({
      where: {
        id: pageId,
        section: {
          notebookId,
          notebook: { userId },
        },
      },
    });
    if (!existing) return notFoundResponse('Page not found');

    const body = await request.json();
    const { title, content, textContent, sortOrder } = body;

    // Input validation — prevent resource exhaustion
    if (title !== undefined && (typeof title !== 'string' || title.length > 500)) {
      return badRequestResponse('Title must be a string under 500 characters');
    }
    if (content !== undefined && typeof content !== 'object') {
      return badRequestResponse('Content must be a JSON object');
    }
    if (content !== undefined && JSON.stringify(content).length > 500_000) {
      return badRequestResponse('Content exceeds maximum size');
    }
    if (textContent !== undefined && typeof textContent !== 'string') {
      return badRequestResponse('Text content must be a string');
    }
    if (textContent !== undefined && textContent.length > 500_000) {
      return badRequestResponse('Text content exceeds maximum size');
    }
    if (sortOrder !== undefined && (typeof sortOrder !== 'number' || !Number.isFinite(sortOrder))) {
      return badRequestResponse('Sort order must be a finite number');
    }

    const updated = await db.page.update({
      where: { id: pageId },
      data: {
        ...(title !== undefined && { title }),
        ...(content !== undefined && { content }),
        ...(textContent !== undefined && { textContent }),
        ...(sortOrder !== undefined && { sortOrder }),
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

    const { id: notebookId, pageId } = await params;

    const existing = await db.page.findFirst({
      where: {
        id: pageId,
        section: {
          notebookId,
          notebook: { userId },
        },
      },
    });
    if (!existing) return notFoundResponse('Page not found');

    // Clean up image files from disk before deleting DB record
    await deletePageImages(pageId);
    await db.page.delete({ where: { id: pageId } });

    return successResponse({ deleted: true });
  } catch {
    return internalErrorResponse();
  }
}
