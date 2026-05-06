import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  successResponse,
  unauthorizedResponse,
  notFoundResponse,
  internalErrorResponse,
} from '@/lib/api-response';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; setId: string; attemptId: string }> }
) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: notebookId, attemptId } = await params;

    const notebook = await db.notebook.findFirst({
      where: { id: notebookId, userId },
    });
    if (!notebook) return notFoundResponse('Notebook not found');

    const attempt = await db.quizAttempt.findFirst({
      where: { id: attemptId, userId },
      include: {
        answers: {
          include: {
            question: true,
          },
        },
      },
    });

    if (!attempt) return notFoundResponse('Attempt not found');

    return successResponse(attempt);
  } catch (error) {
    console.error('Error fetching quiz attempt:', error);
    return internalErrorResponse();
  }
}
