import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import {
  successResponse,
  unauthorizedResponse,
  notFoundResponse,
  internalErrorResponse,
} from '@/lib/api-response';
import { loadMockExamDetail } from '@/lib/mock-exam-loader';

type Params = { params: Promise<{ id: string; mockId: string }> };

/**
 * GET — a mock exam's full detail. Drives both the run surface (sealed set
 * location + duration/hints config) and the results screen (score + real
 * type/topic breakdown + readiness delta once completed). Exam Mode Phase 3.
 */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: examId, mockId } = await params;
    const detail = await loadMockExamDetail(userId, examId, mockId);
    if (!detail) return notFoundResponse('Mock exam not found');

    return successResponse(detail);
  } catch (error) {
    console.error('[exams/:id/mock/:mockId GET]', error);
    return internalErrorResponse();
  }
}
