import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  successResponse,
  badRequestResponse,
  forbiddenResponse,
  notFoundResponse,
  unauthorizedResponse,
  tooManyRequestsResponse,
  internalErrorResponse,
} from '@/lib/api-response';
import { costRateLimit, rateLimitKey } from '@/lib/rate-limit';
import { checkTokenBudget } from '@/lib/token-budget';
import { reserveUsage, refundUsage } from '@/lib/usage-limits';
import { mageGenerationActionsEnabled } from '@/lib/feature-flags';
import { loadExamReadiness } from '@/lib/exam-scope';
import { assembleMockExam, parseMockConfig } from '@/lib/mock-exam';
import { mockSummary, type MockExamRow } from '@/lib/mock-exam-loader';

type Params = { params: Promise<{ id: string }> };

/**
 * Exam Mode (Phase 3) — timed mock-exam endpoints.
 *
 * POST — assemble a sealed, timed mock from the exam's scope + setup config.
 *   Mirrors `/api/mage/practice-sessions`'s security (auth · cost rate-limit ·
 *   monthly token budget · PRO gate · atomic `ai_quizzes` reservation with
 *   refund-on-failure), then snapshots readiness, creates a `PracticeSession` +
 *   `MockExam`, and returns the run-surface deep link.
 *
 * GET — list this exam's recent mocks (the setup screen's history + empty state).
 */

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    // Kill-switch — mocks are a generation feature, same lever as practice.
    if (!mageGenerationActionsEnabled()) {
      return notFoundResponse('Mock exams are unavailable.');
    }

    const { id: examId } = await params;

    // Generation spends real tokens — throttle harder than a chat send.
    const limit = await costRateLimit(rateLimitKey('mock-exam', request, userId), 6, 60_000);
    if (!limit.success) {
      return tooManyRequestsResponse('Too many mock-exam requests. Please slow down.', limit.retryAfterMs);
    }

    const { allowed: tokenAllowed, tokenLimit, tier } = await checkTokenBudget(userId);
    if (!tokenAllowed) {
      return tooManyRequestsResponse(
        `Monthly token limit reached (${tokenLimit.toLocaleString()} tokens). Resets on the 1st of next month.`
      );
    }

    // Ownership — fail closed before any work.
    const exam = await db.exam.findFirst({
      where: { id: examId, userId },
      select: { id: true, title: true },
    });
    if (!exam) return notFoundResponse('Exam not found');

    // PRO gate — mock generation is Pro-only (matches the Mage exam-sim action
    // gate, isPro = tier !== 'FREE'); the deterministic hub flow stays free.
    if (tier === 'FREE') {
      return forbiddenResponse('Mock exams are a Pro feature.');
    }

    const body = await request.json().catch(() => ({}));
    const config = parseMockConfig((body as { config?: unknown }).config ?? body);

    // Re-reserve the generation quota atomically (refunded below on failure so a
    // failed build never burns an allowance). PRO is unlimited (pass-through).
    const reservation = await reserveUsage(userId, 'ai_quizzes');
    if (!reservation.allowed) {
      return tooManyRequestsResponse(
        'You have used up your quiz-generation allowance for this month.'
      );
    }

    // Snapshot readiness BEFORE the mock (best-effort — never fatal). The results
    // screen diffs this against the post-mock snapshot for the honest delta.
    const before = await loadExamReadiness(userId, examId).catch(() => null);
    const readinessBefore = before?.readiness.hasGradedMaterial ? before.readiness.readiness : null;

    const session = await db.practiceSession.create({
      data: { userId, origin: 'exam_sim', examId, status: 'assembling' },
      select: { id: true },
    });

    try {
      const assembled = await assembleMockExam({
        userId,
        tier,
        examId,
        examTitle: exam.title,
        config,
      });

      await db.practiceSession.update({
        where: { id: session.id },
        data: { quizSetId: assembled.quizSetId, status: 'ready' },
      });

      const mock = await db.mockExam.create({
        data: {
          examId,
          userId,
          practiceSessionId: session.id,
          quizSetId: assembled.quizSetId,
          config: { ...config, questionCount: assembled.questionCount },
          readinessBefore,
          status: 'ready',
        },
        select: { id: true },
      });

      return successResponse({
        mockId: mock.id,
        runUrl: `/exam/${encodeURIComponent(examId)}/mock/${encodeURIComponent(mock.id)}`,
        questionCount: assembled.questionCount,
      });
    } catch (err) {
      await refundUsage(userId, 'ai_quizzes').catch(() => {});
      await db.practiceSession.update({ where: { id: session.id }, data: { status: 'failed' } }).catch(() => {});
      const message = err instanceof Error ? err.message : '';
      if (message.includes('not enough scoped material')) {
        return badRequestResponse('Add some paths or quizzes to this exam’s coverage first.');
      }
      console.error('[exams/:id/mock POST] assembly failed', err);
      return internalErrorResponse("Mage couldn't build a mock exam right now. Try again in a moment.");
    }
  } catch (error) {
    console.error('[exams/:id/mock POST]', error);
    return internalErrorResponse();
  }
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: examId } = await params;
    const exam = await db.exam.findFirst({ where: { id: examId, userId }, select: { id: true, title: true } });
    if (!exam) return notFoundResponse('Exam not found');

    const mocks = (await db.mockExam.findMany({
      where: { examId, userId },
      orderBy: { createdAt: 'desc' },
      take: 12,
    })) as unknown as MockExamRow[];

    // Batch the scores for completed mocks in one query (no N+1).
    const attemptIds = mocks.map((m) => m.quizAttemptId).filter((x): x is string => !!x);
    const attempts = attemptIds.length
      ? await db.quizAttempt.findMany({
          where: { id: { in: attemptIds }, userId },
          select: { id: true, percentage: true },
        })
      : [];
    const scoreByAttempt = new Map(attempts.map((a) => [a.id, a.percentage]));

    return successResponse({
      exam: { id: exam.id, title: exam.title },
      mocks: mocks.map((m) => mockSummary(m, m.quizAttemptId ? scoreByAttempt.get(m.quizAttemptId) ?? null : null)),
    });
  } catch (error) {
    console.error('[exams/:id/mock GET]', error);
    return internalErrorResponse();
  }
}
