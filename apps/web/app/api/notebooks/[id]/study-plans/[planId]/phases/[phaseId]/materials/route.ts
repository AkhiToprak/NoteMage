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

type Params = { params: Promise<{ id: string; planId: string; phaseId: string }> };

const VALID_TYPES = ['page', 'flashcard_set', 'quiz_set', 'document'];

/**
 * GET – list materials in a phase
 */
export async function GET(request: NextRequest, { params }: Params) {
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

    const materials = await db.studyMaterial.findMany({
      where: { phaseId },
      orderBy: { sortOrder: 'asc' },
    });

    return successResponse(materials);
  } catch {
    return internalErrorResponse();
  }
}

/**
 * POST – add a material to a phase
 */
export async function POST(request: NextRequest, { params }: Params) {
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
    const { type, referenceId, title, sortOrder } = body as {
      type: string;
      referenceId: string;
      title: string;
      sortOrder?: number;
    };

    if (!type || !VALID_TYPES.includes(type)) {
      return badRequestResponse(`Invalid type. Must be one of: ${VALID_TYPES.join(', ')}`);
    }
    if (!referenceId || !title) {
      return badRequestResponse('referenceId and title are required');
    }

    const maxOrder = await db.studyMaterial.aggregate({
      where: { phaseId },
      _max: { sortOrder: true },
    });

    const material = await db.studyMaterial.create({
      data: {
        phaseId,
        type,
        referenceId,
        title: title.trim(),
        sortOrder: sortOrder ?? (maxOrder._max.sortOrder ?? -1) + 1,
      },
    });

    return createdResponse(material);
  } catch {
    return internalErrorResponse();
  }
}
