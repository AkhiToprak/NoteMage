import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import {
  successResponse,
  unauthorizedResponse,
  notFoundResponse,
  internalErrorResponse,
} from '@/lib/api-response';
import { loadExamWeakAreas } from '@/lib/exam-scope';

type Params = { params: Promise<{ id: string }> };

/**
 * GET – the weak-areas dashboard view for an exam: every weak topic (the full
 * set, not the hub's capped preview) grouped into urgent / needs-practice /
 * almost-fixed and ranked by the readiness each one is costing, plus the primary
 * linked path id for per-topic deep-links. Exam Mode Phase 2.
 */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id } = await params;
    const result = await loadExamWeakAreas(userId, id);
    if (!result) return notFoundResponse('Exam not found');

    return successResponse(result);
  } catch (error) {
    console.error('[exams/:id/weak-areas GET]', error);
    return internalErrorResponse();
  }
}
