import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  successResponse,
  unauthorizedResponse,
  notFoundResponse,
  internalErrorResponse,
} from '@/lib/api-response';

type Params = { params: Promise<{ id: string; setId: string }> };

/**
 * GET – fetch flashcards due for review (spaced repetition study session)
 * Returns all due cards: never-reviewed first, then by nextReviewAt ASC
 */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: notebookId, setId } = await params;

    const notebook = await db.notebook.findFirst({ where: { id: notebookId, userId } });
    if (!notebook) return notFoundResponse('Notebook not found');

    const flashcardSet = await db.flashcardSet.findFirst({
      where: { id: setId, notebookId },
    });
    if (!flashcardSet) return notFoundResponse('Flashcard set not found');

    const now = new Date();

    const dueCards = await db.flashcard.findMany({
      where: {
        flashcardSetId: setId,
        OR: [{ nextReviewAt: null }, { nextReviewAt: { lte: now } }],
      },
      orderBy: [{ nextReviewAt: 'asc' }],
      include: {
        images: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    // Sort so that null nextReviewAt (never reviewed) come first
    dueCards.sort((a, b) => {
      if (a.nextReviewAt === null && b.nextReviewAt === null) return 0;
      if (a.nextReviewAt === null) return -1;
      if (b.nextReviewAt === null) return 1;
      return a.nextReviewAt.getTime() - b.nextReviewAt.getTime();
    });

    return successResponse(dueCards);
  } catch {
    return internalErrorResponse();
  }
}
