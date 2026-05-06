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

type Params = { params: Promise<{ id: string; setId: string; questionId: string }> };

/**
 * PATCH – edit a quiz question
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: notebookId, setId, questionId } = await params;

    const notebook = await db.notebook.findFirst({ where: { id: notebookId, userId } });
    if (!notebook) return notFoundResponse('Notebook not found');

    const quizSet = await db.quizSet.findFirst({ where: { id: setId, notebookId } });
    if (!quizSet) return notFoundResponse('Quiz set not found');

    const questionRecord = await db.quizQuestion.findFirst({
      where: { id: questionId, quizSetId: setId },
    });
    if (!questionRecord) return notFoundResponse('Quiz question not found');

    const body = await request.json().catch(() => ({}));
    const { question, options, correctIndex, hint, correctExplanation, wrongExplanation } =
      body as {
        question?: string;
        options?: string[];
        correctIndex?: number;
        hint?: string | null;
        correctExplanation?: string | null;
        wrongExplanation?: string | null;
      };

    const data: Record<string, unknown> = {};

    if (question !== undefined) {
      if (typeof question !== 'string' || question.trim().length === 0) {
        return badRequestResponse('Question cannot be empty');
      }
      data.question = question.trim();
    }
    if (options !== undefined) {
      if (
        !Array.isArray(options) ||
        options.length !== 4 ||
        options.some((o) => typeof o !== 'string' || o.trim().length === 0)
      ) {
        return badRequestResponse('Options must be an array of exactly 4 non-empty strings');
      }
      data.options = options.map((o) => o.trim());
    }
    if (correctIndex !== undefined) {
      if (typeof correctIndex !== 'number' || correctIndex < 0 || correctIndex > 3) {
        return badRequestResponse('correctIndex must be 0, 1, 2, or 3');
      }
      data.correctIndex = correctIndex;
    }
    if (hint !== undefined) data.hint = hint;
    if (correctExplanation !== undefined) data.correctExplanation = correctExplanation;
    if (wrongExplanation !== undefined) data.wrongExplanation = wrongExplanation;

    if (Object.keys(data).length === 0) {
      return badRequestResponse('No fields to update');
    }

    const updated = await db.quizQuestion.update({
      where: { id: questionId },
      data,
    });

    return successResponse(updated);
  } catch {
    return internalErrorResponse();
  }
}

/**
 * DELETE – remove a single question from a quiz set
 */
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: notebookId, setId, questionId } = await params;

    const notebook = await db.notebook.findFirst({ where: { id: notebookId, userId } });
    if (!notebook) return notFoundResponse('Notebook not found');

    const quizSet = await db.quizSet.findFirst({ where: { id: setId, notebookId } });
    if (!quizSet) return notFoundResponse('Quiz set not found');

    const questionRecord = await db.quizQuestion.findFirst({
      where: { id: questionId, quizSetId: setId },
    });
    if (!questionRecord) return notFoundResponse('Quiz question not found');

    await db.quizQuestion.delete({ where: { id: questionId } });

    return successResponse({ deleted: true });
  } catch {
    return internalErrorResponse();
  }
}
