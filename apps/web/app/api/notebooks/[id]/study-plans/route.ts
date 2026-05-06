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

/**
 * GET – list all study plans in a notebook
 */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: notebookId } = await params;

    const notebook = await db.notebook.findFirst({ where: { id: notebookId, userId } });
    if (!notebook) return notFoundResponse('Notebook not found');

    const plans = await db.studyPlan.findMany({
      where: { notebookId },
      include: {
        _count: { select: { phases: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return successResponse(plans);
  } catch {
    return internalErrorResponse();
  }
}

/**
 * POST – create a new study plan (optionally with inline phases + materials)
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: notebookId } = await params;

    const notebook = await db.notebook.findFirst({ where: { id: notebookId, userId } });
    if (!notebook) return notFoundResponse('Notebook not found');

    const body = await request.json();
    const { title, description, startDate, endDate, source, phases } = body as {
      title: string;
      description?: string;
      startDate: string;
      endDate: string;
      source?: string;
      phases?: {
        title: string;
        description?: string;
        sortOrder?: number;
        startDate: string;
        endDate: string;
        status?: string;
        materials?: {
          type: string;
          referenceId: string;
          title: string;
          sortOrder?: number;
        }[];
      }[];
    };

    if (!title || typeof title !== 'string' || !title.trim()) {
      return badRequestResponse('Title is required');
    }
    if (!startDate || !endDate) {
      return badRequestResponse('Start date and end date are required');
    }

    const plan = await db.$transaction(async (tx) => {
      const created = await tx.studyPlan.create({
        data: {
          notebookId,
          title: title.trim(),
          description: description?.trim() || null,
          startDate: new Date(startDate),
          endDate: new Date(endDate),
          source: source || 'manual',
        },
      });

      if (phases && phases.length > 0) {
        for (let i = 0; i < phases.length; i++) {
          const p = phases[i];
          await tx.studyPhase.create({
            data: {
              planId: created.id,
              title: p.title.trim(),
              description: p.description?.trim() || null,
              sortOrder: p.sortOrder ?? i,
              startDate: new Date(p.startDate),
              endDate: new Date(p.endDate),
              status: p.status || 'upcoming',
              materials: p.materials?.length
                ? {
                    create: p.materials.map((m, j) => ({
                      type: m.type,
                      referenceId: m.referenceId,
                      title: m.title,
                      sortOrder: m.sortOrder ?? j,
                    })),
                  }
                : undefined,
            },
          });
        }
      }

      return tx.studyPlan.findUniqueOrThrow({
        where: { id: created.id },
        include: {
          phases: {
            orderBy: { sortOrder: 'asc' },
            include: { materials: { orderBy: { sortOrder: 'asc' } } },
          },
        },
      });
    });

    return createdResponse(plan);
  } catch {
    return internalErrorResponse();
  }
}
