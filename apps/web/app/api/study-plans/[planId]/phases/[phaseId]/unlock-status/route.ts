import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { isPhaseUnlocked } from '@/lib/path-gating';
import {
  successResponse,
  unauthorizedResponse,
  notFoundResponse,
  internalErrorResponse,
} from '@/lib/api-response';

type Params = { params: Promise<{ planId: string; phaseId: string }> };

// Phase 5 — server-side gate check for a single phase. The path UI uses the
// flat /api/study-plans listing for its render, but direct URL access (e.g.
// pasting a locked lesson URL) goes through this endpoint so the lock cannot
// be bypassed by client-side state alone.
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { planId, phaseId } = await params;

    const plan = await db.studyPlan.findFirst({
      where: { id: planId, notebook: { userId } },
      include: {
        phases: {
          orderBy: { sortOrder: 'asc' },
          include: { materials: { orderBy: { sortOrder: 'asc' } } },
        },
      },
    });
    if (!plan) return notFoundResponse('Study plan not found');

    const phase = plan.phases.find((p) => p.id === phaseId);
    if (!phase) return notFoundResponse('Phase not found');

    const result = isPhaseUnlocked(plan.phases, phaseId);
    return successResponse({
      locked: !result.unlocked,
      reason: result.reason,
    });
  } catch (error) {
    console.error('Error fetching unlock status:', error);
    return internalErrorResponse();
  }
}
