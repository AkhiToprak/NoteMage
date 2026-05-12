import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  successResponse,
  unauthorizedResponse,
  notFoundResponse,
  internalErrorResponse,
  badRequestResponse,
} from '@/lib/api-response';
import { generatePath } from '@/lib/path-generator';

// Phase 10.3 — retry path-generation. `generatePath` is idempotent
// (skips activity kinds the slot already has), so this endpoint just
// flips the plan back into the `generating` state and re-fires the
// orchestrator. The client should reconnect to `/generation` SSE to
// watch the retry stream.

type Params = { params: Promise<{ planId: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { planId } = await params;
    const plan = await db.studyPlan.findFirst({
      where: { id: planId, userId },
      select: { id: true, generationStatus: true },
    });
    if (!plan) return notFoundResponse('Path not found');

    // Block double-fires while a previous run is still in flight.
    if (plan.generationStatus === 'generating') {
      return badRequestResponse('Generation is already in progress');
    }

    await db.studyPlan.update({
      where: { id: planId },
      data: {
        generationStatus: 'generating',
        generationError: null,
      },
    });

    void generatePath(planId).catch((err) => {
      console.error('[learn/paths regenerate]', err);
    });

    return successResponse({ planId, status: 'generating' });
  } catch (error) {
    console.error('[learn/paths regenerate]', error);
    return internalErrorResponse();
  }
}
