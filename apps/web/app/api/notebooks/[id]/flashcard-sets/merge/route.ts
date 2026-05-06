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

type Params = { params: Promise<{ id: string }> };

/**
 * POST – merge multiple flashcard sets into a new one
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: notebookId } = await params;

    const notebook = await db.notebook.findFirst({ where: { id: notebookId, userId } });
    if (!notebook) return notFoundResponse('Notebook not found');

    const body = await request.json();
    const { sourceSetIds, targetTitle, deleteOriginals } = body;

    // Validate sourceSetIds
    if (!Array.isArray(sourceSetIds) || sourceSetIds.length < 2) {
      return badRequestResponse('sourceSetIds must be an array with at least 2 IDs');
    }

    if (sourceSetIds.length > 50) {
      return badRequestResponse('Too many source sets. Maximum is 50.');
    }

    if (!sourceSetIds.every((id: unknown) => typeof id === 'string')) {
      return badRequestResponse('Each sourceSetId must be a string');
    }

    // Validate targetTitle
    const trimmedTitle = typeof targetTitle === 'string' ? targetTitle.trim() : '';
    if (!trimmedTitle) {
      return badRequestResponse('targetTitle must be a non-empty string');
    }

    if (trimmedTitle.length > 500) {
      return badRequestResponse('targetTitle must be 500 characters or less');
    }

    // Verify all source sets exist and belong to this notebook
    const sourceSets = await db.flashcardSet.findMany({
      where: { id: { in: sourceSetIds }, notebookId },
    });
    if (sourceSets.length !== sourceSetIds.length) {
      return badRequestResponse('One or more source sets not found in this notebook');
    }

    const newSet = await db.$transaction(async (tx) => {
      // Fetch all flashcards from source sets, ordered by set then sortOrder
      const allCards = await tx.flashcard.findMany({
        where: { flashcardSetId: { in: sourceSetIds } },
        orderBy: [{ flashcardSetId: 'asc' }, { sortOrder: 'asc' }],
      });

      // Create the new merged set
      const created = await tx.flashcardSet.create({
        data: {
          notebookId,
          title: trimmedTitle,
          source: 'manual',
          chatId: null,
          messageId: null,
        },
      });

      // Create all cards in the new set with sequential sortOrder
      if (allCards.length > 0) {
        await tx.flashcard.createMany({
          data: allCards.map((card, index) => ({
            flashcardSetId: created.id,
            question: card.question,
            answer: card.answer,
            sortOrder: index,
          })),
        });
      }

      // Delete originals if requested
      if (deleteOriginals) {
        await tx.flashcardSet.deleteMany({
          where: { id: { in: sourceSetIds } },
        });
      }

      // Return the new set with its flashcards
      return tx.flashcardSet.findFirst({
        where: { id: created.id },
        include: {
          flashcards: {
            orderBy: { sortOrder: 'asc' },
          },
        },
      });
    });

    return createdResponse(newSet);
  } catch {
    return internalErrorResponse();
  }
}
