import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  successResponse,
  unauthorizedResponse,
  notFoundResponse,
  badRequestResponse,
  internalErrorResponse,
} from '@/lib/api-response';

type Params = { params: Promise<{ id: string; pageId: string }> };

export async function PUT(request: NextRequest, { params }: Params) {
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

    const body = await request.json();
    const { drawingData } = body;

    if (!Array.isArray(drawingData)) {
      return badRequestResponse('drawingData must be an array');
    }

    const updated = await db.page.update({
      where: { id: pageId },
      data: { drawingData },
    });

    return successResponse(updated);
  } catch {
    return internalErrorResponse();
  }
}
