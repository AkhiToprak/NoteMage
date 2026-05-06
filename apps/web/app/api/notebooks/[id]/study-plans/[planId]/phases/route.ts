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

type Params = { params: Promise<{ id: string; planId: string }> };

/**
 * GET – list phases for a study plan
 */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: notebookId, planId } = await params;

    const notebook = await db.notebook.findFirst({ where: { id: notebookId, userId } });
    if (!notebook) return notFoundResponse('Notebook not found');

    const plan = await db.studyPlan.findFirst({ where: { id: planId, notebookId } });
    if (!plan) return notFoundResponse('Study plan not found');

    const phases = await db.studyPhase.findMany({
      where: { planId },
      orderBy: { sortOrder: 'asc' },
      include: {
        materials: { orderBy: { sortOrder: 'asc' } },
        _count: { select: { materials: true } },
      },
    });

    return successResponse(phases);
  } catch {
    return internalErrorResponse();
  }
}

/**
 * POST – create a new phase in a study plan
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: notebookId, planId } = await params;

    const notebook = await db.notebook.findFirst({ where: { id: notebookId, userId } });
    if (!notebook) return notFoundResponse('Notebook not found');

    const plan = await db.studyPlan.findFirst({ where: { id: planId, notebookId } });
    if (!plan) return notFoundResponse('Study plan not found');

    const body = await request.json();
    const { title, description, sortOrder, startDate, endDate, status } = body as {
      title: string;
      description?: string;
      sortOrder?: number;
      startDate: string;
      endDate: string;
      status?: string;
    };

    if (!title || typeof title !== 'string' || !title.trim()) {
      return badRequestResponse('Title is required');
    }
    if (!startDate || !endDate) {
      return badRequestResponse('Start date and end date are required');
    }

    // Auto-calculate sortOrder if not provided
    const maxOrder = await db.studyPhase.aggregate({
      where: { planId },
      _max: { sortOrder: true },
    });

    const phase = await db.studyPhase.create({
      data: {
        planId,
        title: title.trim(),
        description: description?.trim() || null,
        sortOrder: sortOrder ?? (maxOrder._max.sortOrder ?? -1) + 1,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        status: status || 'upcoming',
      },
      include: { materials: true },
    });

    return createdResponse(phase);
  } catch {
    return internalErrorResponse();
  }
}
