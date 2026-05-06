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

type Params = { params: Promise<{ id: string; planId: string }> };

/**
 * GET – fetch a study plan with all phases and materials
 */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: notebookId, planId } = await params;

    const notebook = await db.notebook.findFirst({ where: { id: notebookId, userId } });
    if (!notebook) return notFoundResponse('Notebook not found');

    const plan = await db.studyPlan.findFirst({
      where: { id: planId, notebookId },
      include: {
        phases: {
          orderBy: { sortOrder: 'asc' },
          include: {
            materials: { orderBy: { sortOrder: 'asc' } },
            _count: { select: { materials: true } },
          },
        },
      },
    });
    if (!plan) return notFoundResponse('Study plan not found');

    return successResponse(plan);
  } catch {
    return internalErrorResponse();
  }
}

/**
 * PATCH – update study plan metadata
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: notebookId, planId } = await params;

    const notebook = await db.notebook.findFirst({ where: { id: notebookId, userId } });
    if (!notebook) return notFoundResponse('Notebook not found');

    const plan = await db.studyPlan.findFirst({ where: { id: planId, notebookId } });
    if (!plan) return notFoundResponse('Study plan not found');

    const body = await request.json();
    const { title, description, startDate, endDate } = body as {
      title?: string;
      description?: string;
      startDate?: string;
      endDate?: string;
    };

    const data: Record<string, unknown> = {};
    if (title !== undefined) {
      if (!title.trim()) return badRequestResponse('Title cannot be empty');
      data.title = title.trim();
    }
    if (description !== undefined) data.description = description?.trim() || null;
    if (startDate !== undefined) data.startDate = new Date(startDate);
    if (endDate !== undefined) data.endDate = new Date(endDate);

    const updated = await db.studyPlan.update({
      where: { id: planId },
      data,
      include: {
        phases: {
          orderBy: { sortOrder: 'asc' },
          include: { materials: { orderBy: { sortOrder: 'asc' } } },
        },
      },
    });

    return successResponse(updated);
  } catch {
    return internalErrorResponse();
  }
}

/**
 * DELETE – delete a study plan (cascades to phases and materials)
 */
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: notebookId, planId } = await params;

    const notebook = await db.notebook.findFirst({ where: { id: notebookId, userId } });
    if (!notebook) return notFoundResponse('Notebook not found');

    const plan = await db.studyPlan.findFirst({ where: { id: planId, notebookId } });
    if (!plan) return notFoundResponse('Study plan not found');

    await db.studyPlan.delete({ where: { id: planId } });

    return successResponse({ deleted: true });
  } catch {
    return internalErrorResponse();
  }
}
