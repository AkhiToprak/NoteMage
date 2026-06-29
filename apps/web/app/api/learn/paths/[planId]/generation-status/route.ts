import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  successResponse,
  unauthorizedResponse,
  notFoundResponse,
  internalErrorResponse,
} from '@/lib/api-response';

// Lightweight generation-status probe for the path detail view's in-flight
// poll. Unlike `GET /api/learn/paths/[planId]` (which loads the full
// phase→slot→activity tree and runs annotatePhases gating over every node),
// this returns ONLY the few scalar fields the poll needs to decide whether a
// full refetch is actually worth it:
//   • generationStatus / generationError — to detect the ready/failed settle
//   • updatedAt                          — for client-side stale-detection
//   • completedSlots                     — bumps each time Stage B finishes a
//                                          checkpoint, the cue to refetch the
//                                          tree so the new studyable node renders
// So during a multi-minute generation the deep tree+gating cost is paid once
// per finished checkpoint instead of every 3s — see PathDetailView's poll.

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ planId: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { planId } = await params;
    const row = await db.studyPlan.findFirst({
      where: { id: planId, userId },
      select: {
        generationStatus: true,
        generationError: true,
        generationProgress: true,
        updatedAt: true,
      },
    });
    if (!row) return notFoundResponse('Path not found');

    // generationProgress is `{ totalSlots, completedSlots, currentSlot,
    // currentActivity }` once Stage B starts writing, but is null while queued
    // and absent on legacy rows — default to 0 so the poll never NaN-compares.
    const gp = row.generationProgress;
    const completedSlots =
      gp && typeof gp === 'object' && !Array.isArray(gp) &&
      typeof (gp as Record<string, unknown>).completedSlots === 'number'
        ? ((gp as Record<string, unknown>).completedSlots as number)
        : 0;

    return successResponse({
      generationStatus: row.generationStatus,
      generationError: row.generationError ?? null,
      updatedAt: row.updatedAt.toISOString(),
      completedSlots,
    });
  } catch (error) {
    console.error('[learn/paths/[planId] generation-status GET]', error);
    return internalErrorResponse();
  }
}
