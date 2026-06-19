import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import {
  successResponse,
  unauthorizedResponse,
  notFoundResponse,
  internalErrorResponse,
} from '@/lib/api-response';
import { loadExamReadiness } from '@/lib/exam-scope';

type Params = { params: Promise<{ id: string }> };

/**
 * GET – aggregate readiness for an exam: a 0–100 rollup over its scoped paths
 * (via `derivePathStats`), quiz sets (best attempt), and passive material, plus
 * the ranked weak topics + per-item breakdown. Mage Revolution Phase 5.
 */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id } = await params;
    const result = await loadExamReadiness(userId, id);
    if (!result) return notFoundResponse('Exam not found');

    return successResponse(result);
  } catch (error) {
    console.error('[exams/:id/readiness GET]', error);
    return internalErrorResponse();
  }
}
