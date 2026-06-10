import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  successResponse,
  unauthorizedResponse,
  notFoundResponse,
  badRequestResponse,
  internalErrorResponse,
} from '@/lib/api-response';
import { staleGenerationCutoff } from '@/lib/path-loader';

type Params = { params: Promise<{ planId: string }> };

// Cancel a wedged in-place TRANSLATION and restore the path. A translation
// (translatePath) only mutates text columns and preserves all content +
// progress; while it runs the row sits in generationStatus='generating' with
// generationProgress.mode='translate'. If the detached translator dies (e.g. a
// Coolify redeploy), the row wedges there forever. Unlike a stuck *generation*
// (which is incomplete and gets deleted), the path here is fully intact, so the
// correct recovery is to flip it back to 'ready' — never delete it.
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { planId } = await params;
    const plan = await db.studyPlan.findFirst({
      where: { id: planId, userId },
      select: { id: true, generationProgress: true },
    });
    if (!plan) return notFoundResponse('Path not found');

    const gp = plan.generationProgress;
    const mode =
      gp && typeof gp === 'object' && !Array.isArray(gp)
        ? (gp as Record<string, unknown>).mode
        : null;
    // Restore only applies to a stuck translation. A stuck generation is
    // incomplete and must be deleted (the DELETE route), not marked ready —
    // refuse here so this endpoint can never resurrect a half-built path.
    if (mode !== 'translate') {
      return badRequestResponse('This path has no translation to cancel.');
    }

    // Atomic claim: only wins against a DEAD/stale generating row (mirrors
    // regenerate/delete's liveness guard), so a live translator isn't yanked
    // mid-write. Flip back to 'ready' and clear the stale translate marker.
    const restored = await db.studyPlan.updateMany({
      where: {
        id: planId,
        userId,
        generationStatus: 'generating',
        updatedAt: { lt: staleGenerationCutoff() },
      },
      data: {
        generationStatus: 'ready',
        generationProgress: Prisma.DbNull,
        generationError: null,
      },
    });

    if (restored.count === 0) {
      // Lost the claim: a live translation, an already-resolved row, or deleted
      // between the read and the claim. Re-read to disambiguate (mirrors regenerate).
      const current = await db.studyPlan.findFirst({
        where: { id: planId, userId },
        select: { generationStatus: true },
      });
      if (!current) return notFoundResponse('Path not found');
      if (current.generationStatus === 'generating') {
        return badRequestResponse('Translation is still running — try again shortly');
      }
      // Already ready/failed → nothing to restore; idempotent success.
      return successResponse({ planId, status: current.generationStatus });
    }

    return successResponse({ planId, status: 'ready' });
  } catch (error) {
    console.error('[learn/paths/[planId] cancel]', error);
    return internalErrorResponse();
  }
}
