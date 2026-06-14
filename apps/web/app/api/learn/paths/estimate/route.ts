import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { loadMaterialCorpus } from '@/lib/path-corpus';
import { computeCorpusFit, pathContentCap } from '@/lib/path-corpus-fit';
import {
  successResponse,
  unauthorizedResponse,
  badRequestResponse,
  internalErrorResponse,
} from '@/lib/api-response';

/**
 * Pre-generation corpus-fit estimate for the path-setup modal.
 *
 * The picker holds only material IDs (no text), so it can't measure the
 * selection client-side. This loads the selected materials (ownership-checked,
 * selected-only so the work is bounded), runs the SAME water-fill the generator
 * uses (computeCorpusFit mirrors renderMaterialCorpus), and reports whether the
 * selection fits the path-type cap — so the user is warned BEFORE generating
 * instead of being silently trimmed. `ultra` only selects which cap to measure
 * against; the real entitlement gate lives on the generate route.
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const body = (await request.json().catch(() => ({}))) as {
      materialIds?: unknown;
      ultra?: unknown;
    };
    const materialIds = Array.isArray(body.materialIds)
      ? body.materialIds.filter((id): id is string => typeof id === 'string')
      : [];
    const ultra = body.ultra === true;

    if (materialIds.length === 0) {
      return badRequestResponse('No materials selected');
    }

    const entries = await loadMaterialCorpus(userId, materialIds);
    if (!entries) {
      return badRequestResponse('One or more material IDs are invalid');
    }

    return successResponse(computeCorpusFit(entries, pathContentCap(ultra), ultra));
  } catch (error) {
    console.error('[learn/paths/estimate POST]', error);
    return internalErrorResponse();
  }
}
