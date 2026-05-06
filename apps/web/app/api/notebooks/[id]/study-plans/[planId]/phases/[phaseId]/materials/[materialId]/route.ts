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

type Params = {
  params: Promise<{ id: string; planId: string; phaseId: string; materialId: string }>;
};

/**
 * PATCH – update a material (toggle completed, update sortOrder/title)
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: notebookId, planId, phaseId, materialId } = await params;

    const notebook = await db.notebook.findFirst({ where: { id: notebookId, userId } });
    if (!notebook) return notFoundResponse('Notebook not found');

    const plan = await db.studyPlan.findFirst({ where: { id: planId, notebookId } });
    if (!plan) return notFoundResponse('Study plan not found');

    const phase = await db.studyPhase.findFirst({ where: { id: phaseId, planId } });
    if (!phase) return notFoundResponse('Phase not found');

    const material = await db.studyMaterial.findFirst({ where: { id: materialId, phaseId } });
    if (!material) return notFoundResponse('Material not found');

    const body = await request.json();
    const { completed, sortOrder, title } = body as {
      completed?: boolean;
      sortOrder?: number;
      title?: string;
    };

    const data: Record<string, unknown> = {};
    if (completed !== undefined) data.completed = completed;
    if (sortOrder !== undefined) data.sortOrder = sortOrder;
    if (title !== undefined) {
      if (!title.trim()) return badRequestResponse('Title cannot be empty');
      data.title = title.trim();
    }

    const updated = await db.studyMaterial.update({
      where: { id: materialId },
      data,
    });

    return successResponse(updated);
  } catch {
    return internalErrorResponse();
  }
}

/**
 * DELETE – remove a material from a phase
 */
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: notebookId, planId, phaseId, materialId } = await params;

    const notebook = await db.notebook.findFirst({ where: { id: notebookId, userId } });
    if (!notebook) return notFoundResponse('Notebook not found');

    const plan = await db.studyPlan.findFirst({ where: { id: planId, notebookId } });
    if (!plan) return notFoundResponse('Study plan not found');

    const phase = await db.studyPhase.findFirst({ where: { id: phaseId, planId } });
    if (!phase) return notFoundResponse('Phase not found');

    const material = await db.studyMaterial.findFirst({ where: { id: materialId, phaseId } });
    if (!material) return notFoundResponse('Material not found');

    await db.studyMaterial.delete({ where: { id: materialId } });

    return successResponse({ deleted: true });
  } catch {
    return internalErrorResponse();
  }
}
