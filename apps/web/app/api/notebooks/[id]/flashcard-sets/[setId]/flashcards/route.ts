import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  createdResponse,
  badRequestResponse,
  unauthorizedResponse,
  notFoundResponse,
  internalErrorResponse,
} from '@/lib/api-response';

type Params = { params: Promise<{ id: string; setId: string }> };

/**
 * POST – create a new flashcard in a set
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: notebookId, setId } = await params;

    const notebook = await db.notebook.findFirst({ where: { id: notebookId, userId } });
    if (!notebook) return notFoundResponse('Notebook not found');

    const flashcardSet = await db.flashcardSet.findFirst({ where: { id: setId, notebookId } });
    if (!flashcardSet) return notFoundResponse('Flashcard set not found');

    const body = await request.json().catch(() => ({}));
    const { question, answer, sortOrder } = body as {
      question?: string;
      answer?: string;
      sortOrder?: number;
    };

    if (typeof question !== 'string' || question.trim().length === 0) {
      return badRequestResponse('Question cannot be empty');
    }
    if (question.length > 50000) {
      return badRequestResponse('Question must be 50000 characters or less');
    }
    if (typeof answer !== 'string' || answer.trim().length === 0) {
      return badRequestResponse('Answer cannot be empty');
    }
    if (answer.length > 50000) {
      return badRequestResponse('Answer must be 50000 characters or less');
    }

    let computedSortOrder: number;
    if (typeof sortOrder === 'number') {
      computedSortOrder = sortOrder;
    } else {
      const lastCard = await db.flashcard.findFirst({
        where: { flashcardSetId: setId },
        orderBy: { sortOrder: 'desc' },
      });
      computedSortOrder = (lastCard?.sortOrder ?? -1) + 1;
    }

    const card = await db.flashcard.create({
      data: {
        question: question.trim(),
        answer: answer.trim(),
        sortOrder: computedSortOrder,
        flashcardSetId: setId,
      },
    });

    return createdResponse(card);
  } catch {
    return internalErrorResponse();
  }
}
