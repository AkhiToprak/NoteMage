import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import {
  successResponse,
  unauthorizedResponse,
  internalErrorResponse,
} from '@/lib/api-response';
import { loadExamsOverview } from '@/lib/exam-scope';

/**
 * GET – the exams-list overview: upcoming exams enriched with readiness
 * ("Active") + recent past exams ("Archived"). Backs app/(dashboard)/exams.
 *
 * This static segment shadows /api/user/exams/[id] only for the literal id
 * "overview" — exam ids are cuids, so there is no real collision.
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const overview = await loadExamsOverview(userId);
    return successResponse(overview);
  } catch (error) {
    console.error('[exams/overview GET]', error);
    return internalErrorResponse();
  }
}
