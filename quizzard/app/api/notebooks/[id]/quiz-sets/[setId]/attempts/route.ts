import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { recordActivity } from '@/lib/activity';
import {
  successResponse,
  createdResponse,
  badRequestResponse,
  unauthorizedResponse,
  notFoundResponse,
  internalErrorResponse,
} from '@/lib/api-response';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; setId: string }> }
) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: notebookId, setId } = await params;

    // Verify notebook ownership
    const notebook = await db.notebook.findFirst({
      where: { id: notebookId, userId },
    });
    if (!notebook) return notFoundResponse('Notebook not found');

    // Verify quiz set exists
    const quizSet = await db.quizSet.findFirst({
      where: { id: setId, notebookId },
      include: { questions: true },
    });
    if (!quizSet) return notFoundResponse('Quiz set not found');

    const body = await request.json();
    const { answers, timeSpent } = body as {
      answers: { questionId: string; selectedIdx: number }[];
      timeSpent?: number;
    };

    if (!answers || !Array.isArray(answers) || answers.length === 0) {
      return badRequestResponse('Answers are required');
    }

    // Calculate score
    const questionMap = new Map(quizSet.questions.map(q => [q.id, q]));
    let score = 0;
    const answerRecords = answers.map(a => {
      const question = questionMap.get(a.questionId);
      const isCorrect = question ? question.correctIndex === a.selectedIdx : false;
      if (isCorrect) score++;
      return {
        questionId: a.questionId,
        selectedIdx: a.selectedIdx,
        isCorrect,
      };
    });

    const total = quizSet.questions.length;
    const percentage = total > 0 ? Math.round((score / total) * 100 * 100) / 100 : 0;

    // Create attempt with answers
    const attempt = await db.quizAttempt.create({
      data: {
        quizSetId: setId,
        userId,
        score,
        total,
        percentage,
        timeSpent: timeSpent ?? null,
        answers: {
          create: answerRecords,
        },
      },
      include: { answers: true },
    });

    // Record activity
    await recordActivity(userId, 'quiz');

    return createdResponse(attempt);
  } catch (error) {
    console.error('Error creating quiz attempt:', error);
    return internalErrorResponse();
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; setId: string }> }
) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: notebookId, setId } = await params;

    const notebook = await db.notebook.findFirst({
      where: { id: notebookId, userId },
    });
    if (!notebook) return notFoundResponse('Notebook not found');

    const attempts = await db.quizAttempt.findMany({
      where: { quizSetId: setId, userId },
      orderBy: { createdAt: 'desc' },
      include: {
        answers: {
          include: {
            question: {
              select: { id: true, question: true, options: true, correctIndex: true },
            },
          },
        },
      },
    });

    return successResponse(attempts);
  } catch (error) {
    console.error('Error fetching quiz attempts:', error);
    return internalErrorResponse();
  }
}
