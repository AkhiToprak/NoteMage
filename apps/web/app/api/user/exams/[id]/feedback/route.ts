import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import {
  successResponse,
  badRequestResponse,
  notFoundResponse,
  unauthorizedResponse,
  internalErrorResponse,
} from '@/lib/api-response';
import { saveExamFeedback } from '@/lib/exam-result';

type Params = { params: Promise<{ id: string }> };

/**
 * Exam Mode (Phase 5) — post-exam feedback (surprise topics) for one exam.
 *
 * POST — store the topics the learner flagged as exam-day surprises (+ an
 *        optional note) onto the result. Surfaced on the report's "key feedback
 *        topics" card and available when preparing the next exam. Requires a
 *        recorded result (feedback follows the result). Material UPLOADS reuse the
 *        existing notebook import pipeline directly from the client — this route
 *        only persists the topic tags (no AI, no meter).
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();
    const { id: examId } = await params;

    const body = (await request.json().catch(() => ({}))) as { topics?: unknown; note?: unknown };
    const topics = Array.isArray(body.topics)
      ? body.topics.filter((t): t is string => typeof t === 'string')
      : [];
    if (topics.length === 0) return badRequestResponse('Add at least one topic.');

    const saved = await saveExamFeedback(
      userId,
      examId,
      topics,
      typeof body.note === 'string' ? body.note : undefined,
    );
    if (!saved) return notFoundResponse('Record an exam result before adding feedback.');
    return successResponse(saved);
  } catch (error) {
    console.error('[exams/:id/feedback POST]', error);
    return internalErrorResponse();
  }
}
