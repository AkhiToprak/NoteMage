import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  successResponse,
  badRequestResponse,
  unauthorizedResponse,
  notFoundResponse,
  internalErrorResponse,
} from '@/lib/api-response';
import { loadExamReadiness } from '@/lib/exam-scope';

type Params = { params: Promise<{ id: string; mockId: string }> };

/**
 * POST — finalize a mock exam. The sealed run grades + posts its attempt through
 * the canonical attempt route (zero new grading code); this thin call LINKS that
 * attempt to the `MockExam`, snapshots post-mock readiness, and flips the mock to
 * `completed` so the results screen can render the breakdown + readiness delta.
 * Idempotent — re-posting a completed mock returns ok. Exam Mode Phase 3.
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: examId, mockId } = await params;

    const mock = await db.mockExam.findFirst({
      where: { id: mockId, examId, userId },
      select: { id: true, quizSetId: true, status: true, practiceSessionId: true },
    });
    if (!mock) return notFoundResponse('Mock exam not found');

    const resultUrl = `/exam/${encodeURIComponent(examId)}/mock/${encodeURIComponent(mockId)}/results`;

    // Already finalized — idempotent no-op (a double-submit or a refresh).
    if (mock.status === 'completed') {
      return successResponse({ ok: true, resultUrl });
    }

    const body = await request.json().catch(() => ({}));
    const attemptId = (body as { attemptId?: unknown }).attemptId;
    if (typeof attemptId !== 'string' || !attemptId) {
      return badRequestResponse('Missing attemptId.');
    }

    // Re-authorize: the attempt must be the learner's own AND belong to this
    // mock's sealed set (never trust the client to hand us any attempt id).
    const attempt = await db.quizAttempt.findFirst({
      where: { id: attemptId, userId, quizSetId: mock.quizSetId ?? '__none__' },
      select: { id: true },
    });
    if (!attempt) return badRequestResponse('That attempt does not belong to this mock exam.');

    // Snapshot readiness AFTER the mock (best-effort — never fatal).
    const after = await loadExamReadiness(userId, examId).catch(() => null);
    const readinessAfter = after?.readiness.hasGradedMaterial ? after.readiness.readiness : null;

    await db.mockExam.update({
      where: { id: mockId },
      data: { quizAttemptId: attemptId, readinessAfter, status: 'completed' },
    });
    if (mock.practiceSessionId) {
      await db.practiceSession
        .update({ where: { id: mock.practiceSessionId }, data: { status: 'completed' } })
        .catch(() => {});
    }

    return successResponse({ ok: true, resultUrl });
  } catch (error) {
    console.error('[exams/:id/mock/:mockId/complete POST]', error);
    return internalErrorResponse();
  }
}
