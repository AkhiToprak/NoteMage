import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { successResponse, unauthorizedResponse, internalErrorResponse } from '@/lib/api-response';

// Aggregate quiz performance for the authenticated user's profile stats strip:
// total questions answered + overall accuracy, summed across every QuizAttempt.
// `total` is the question count of an attempt and `score` the number correct,
// so the weighted accuracy is sum(score) / sum(total). Returns `accuracy: null`
// when the user has answered nothing yet, so the UI can render an empty state
// instead of a misleading 0%.
export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const agg = await db.quizAttempt.aggregate({
      where: { userId },
      _sum: { total: true, score: true },
    });

    const questionsAnswered = agg._sum.total ?? 0;
    const correct = agg._sum.score ?? 0;
    const accuracy =
      questionsAnswered > 0 ? Math.round((correct / questionsAnswered) * 100) : null;

    return successResponse({ questionsAnswered, correct, accuracy });
  } catch (error) {
    console.error('[user/quiz-stats GET]', error);
    return internalErrorResponse();
  }
}
