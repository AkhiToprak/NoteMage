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

type Params = { params: Promise<{ id: string; setId: string; cardId: string }> };

/**
 * PATCH – edit a flashcard's question and/or answer
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: notebookId, setId, cardId } = await params;

    const notebook = await db.notebook.findFirst({ where: { id: notebookId, userId } });
    if (!notebook) return notFoundResponse('Notebook not found');

    const flashcardSet = await db.flashcardSet.findFirst({ where: { id: setId, notebookId } });
    if (!flashcardSet) return notFoundResponse('Flashcard set not found');

    const card = await db.flashcard.findFirst({ where: { id: cardId, flashcardSetId: setId } });
    if (!card) return notFoundResponse('Flashcard not found');

    const body = await request.json().catch(() => ({}));
    const { question, answer } = body as { question?: string; answer?: string };

    const data: { question?: string; answer?: string } = {};
    if (question !== undefined) {
      if (typeof question !== 'string' || question.trim().length === 0) {
        return badRequestResponse('Question cannot be empty');
      }
      data.question = question.trim();
    }
    if (answer !== undefined) {
      if (typeof answer !== 'string' || answer.trim().length === 0) {
        return badRequestResponse('Answer cannot be empty');
      }
      data.answer = answer.trim();
    }

    if (Object.keys(data).length === 0) {
      return badRequestResponse('No fields to update');
    }

    const updated = await db.flashcard.update({
      where: { id: cardId },
      data,
    });

    return successResponse(updated);
  } catch {
    return internalErrorResponse();
  }
}

/**
 * DELETE – remove a single flashcard from a set
 */
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: notebookId, setId, cardId } = await params;

    const notebook = await db.notebook.findFirst({ where: { id: notebookId, userId } });
    if (!notebook) return notFoundResponse('Notebook not found');

    const flashcardSet = await db.flashcardSet.findFirst({ where: { id: setId, notebookId } });
    if (!flashcardSet) return notFoundResponse('Flashcard set not found');

    const card = await db.flashcard.findFirst({ where: { id: cardId, flashcardSetId: setId } });
    if (!card) return notFoundResponse('Flashcard not found');

    await db.flashcard.delete({ where: { id: cardId } });

    return successResponse({ deleted: true });
  } catch {
    return internalErrorResponse();
  }
}
