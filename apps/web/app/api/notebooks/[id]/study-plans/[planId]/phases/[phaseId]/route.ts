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

type Params = { params: Promise<{ id: string; planId: string; phaseId: string }> };

/**
 * PATCH – update a study phase
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: notebookId, planId, phaseId } = await params;

    const notebook = await db.notebook.findFirst({ where: { id: notebookId, userId } });
    if (!notebook) return notFoundResponse('Notebook not found');

    const plan = await db.studyPlan.findFirst({ where: { id: planId, notebookId } });
    if (!plan) return notFoundResponse('Study plan not found');

    const phase = await db.studyPhase.findFirst({ where: { id: phaseId, planId } });
    if (!phase) return notFoundResponse('Phase not found');

    const body = await request.json();
    const { title, description, startDate, endDate, status, sortOrder } = body as {
      title?: string;
      description?: string;
      startDate?: string;
      endDate?: string;
      status?: string;
      sortOrder?: number;
    };

    const data: Record<string, unknown> = {};
    if (title !== undefined) {
      if (!title.trim()) return badRequestResponse('Title cannot be empty');
      data.title = title.trim();
    }
    if (description !== undefined) data.description = description?.trim() || null;
    if (startDate !== undefined) data.startDate = new Date(startDate);
    if (endDate !== undefined) data.endDate = new Date(endDate);
    if (status !== undefined) {
      if (!['upcoming', 'active', 'completed'].includes(status)) {
        return badRequestResponse('Invalid status');
      }
      data.status = status;
    }
    if (sortOrder !== undefined) data.sortOrder = sortOrder;

    const updated = await db.studyPhase.update({
      where: { id: phaseId },
      data,
      include: { materials: { orderBy: { sortOrder: 'asc' } } },
    });

    return successResponse(updated);
  } catch {
    return internalErrorResponse();
  }
}

/**
 * DELETE – delete a study phase
 */
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: notebookId, planId, phaseId } = await params;

    const notebook = await db.notebook.findFirst({ where: { id: notebookId, userId } });
    if (!notebook) return notFoundResponse('Notebook not found');

    const plan = await db.studyPlan.findFirst({ where: { id: planId, notebookId } });
    if (!plan) return notFoundResponse('Study plan not found');

    const phase = await db.studyPhase.findFirst({ where: { id: phaseId, planId } });
    if (!phase) return notFoundResponse('Phase not found');

    await db.studyPhase.delete({ where: { id: phaseId } });

    return successResponse({ deleted: true });
  } catch {
    return internalErrorResponse();
  }
}
