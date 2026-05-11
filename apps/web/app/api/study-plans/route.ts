import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { annotatePhases } from '@/lib/path-gating';
import {
  successResponse,
  unauthorizedResponse,
  internalErrorResponse,
} from '@/lib/api-response';

// Phase 5 — flat list endpoint for the /learn surface. Returns every study
// plan the current user owns across all their notebooks, with phase and
// material unlock flags precomputed so the client never has to know the
// gating rules.
export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const plans = await db.studyPlan.findMany({
      where: { notebook: { userId } },
      orderBy: { updatedAt: 'desc' },
      include: {
        notebook: { select: { id: true, name: true } },
        phases: {
          orderBy: { sortOrder: 'asc' },
          include: { materials: { orderBy: { sortOrder: 'asc' } } },
        },
      },
    });

    const data = plans.map((plan) => {
      const annotated = annotatePhases(plan.phases);
      return {
        id: plan.id,
        title: plan.title,
        description: plan.description,
        notebookId: plan.notebookId,
        notebookTitle: plan.notebook.name,
        startDate: plan.startDate,
        endDate: plan.endDate,
        source: plan.source,
        phases: annotated.map((ap) => ({
          id: ap.source.id,
          title: ap.source.title,
          description: ap.source.description,
          sortOrder: ap.source.sortOrder,
          status: ap.source.status,
          gateStrategy: ap.source.gateStrategy,
          unlocked: ap.unlocked,
          unlockReason: ap.unlockReason,
          materials: ap.materials.map((m) => ({
            id: m.id,
            type: m.type,
            referenceId: m.referenceId,
            title: m.title,
            completed: m.completed,
            sortOrder: m.sortOrder,
            prerequisiteMaterialIds: m.prerequisiteMaterialIds,
            unlocked: m.unlocked,
            isCheckpoint: m.isCheckpoint,
          })),
        })),
      };
    });

    return successResponse(data);
  } catch (error) {
    console.error('Error listing study plans:', error);
    return internalErrorResponse();
  }
}
