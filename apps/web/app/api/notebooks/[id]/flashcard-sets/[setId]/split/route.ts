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
 * POST – split a flashcard set by moving selected cards into a new set
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: notebookId, setId } = await params;

    const notebook = await db.notebook.findFirst({ where: { id: notebookId, userId } });
    if (!notebook) return notFoundResponse('Notebook not found');

    // Verify the set exists and belongs to this notebook (ownership check outside transaction)
    const setExists = await db.flashcardSet.findFirst({
      where: { id: setId, notebookId },
    });
    if (!setExists) return notFoundResponse('Flashcard set not found');

    const body = await request.json();
    const { cardIds, newTitle } = body;

    // Validate cardIds
    if (!Array.isArray(cardIds) || cardIds.length === 0) {
      return badRequestResponse('cardIds must be a non-empty array');
    }

    if (cardIds.length > 20000) {
      return badRequestResponse('Too many cardIds. Maximum is 20000.');
    }

    if (!cardIds.every((id: unknown) => typeof id === 'string')) {
      return badRequestResponse('Each cardId must be a string');
    }

    // Validate newTitle
    const trimmedTitle = typeof newTitle === 'string' ? newTitle.trim() : '';
    if (!trimmedTitle) {
      return badRequestResponse('newTitle must be a non-empty string');
    }

    if (trimmedTitle.length > 500) {
      return badRequestResponse('newTitle must be 500 characters or less');
    }

    const result = await db.$transaction(async (tx) => {
      // Fetch source set with cards inside transaction to prevent TOCTOU
      const sourceSet = await tx.flashcardSet.findFirst({
        where: { id: setId, notebookId },
        include: {
          flashcards: {
            orderBy: { sortOrder: 'asc' },
          },
        },
      });
      if (!sourceSet) throw new Error('Flashcard set not found');

      // Verify all cardIds belong to the source set
      const sourceCardIds = new Set(sourceSet.flashcards.map((c) => c.id));
      const invalidIds = cardIds.filter((id: string) => !sourceCardIds.has(id));
      if (invalidIds.length > 0) {
        throw new Error('One or more cardIds do not belong to this flashcard set');
      }

      // Must leave at least 1 card in the original set
      if (cardIds.length >= sourceSet.flashcards.length) {
        throw new Error('Cannot move all cards; at least one must remain in the original set');
      }
      // Create the new set with same sectionId as original
      const newSet = await tx.flashcardSet.create({
        data: {
          notebookId,
          title: trimmedTitle,
          source: 'manual',
          chatId: null,
          messageId: null,
          sectionId: sourceSet.sectionId,
        },
      });

      // Move selected cards to the new set
      await tx.flashcard.updateMany({
        where: { id: { in: cardIds } },
        data: { flashcardSetId: newSet.id },
      });

      // Re-index sortOrder on the new set
      const movedCardIdSet = new Set(cardIds as string[]);
      const movedCards = sourceSet.flashcards.filter((c) => movedCardIdSet.has(c.id));
      for (let i = 0; i < movedCards.length; i++) {
        await tx.flashcard.update({
          where: { id: movedCards[i].id },
          data: { sortOrder: i },
        });
      }

      // Re-index sortOrder on the original set
      const remainingCards = sourceSet.flashcards.filter((c) => !movedCardIdSet.has(c.id));
      for (let i = 0; i < remainingCards.length; i++) {
        await tx.flashcard.update({
          where: { id: remainingCards[i].id },
          data: { sortOrder: i },
        });
      }

      // Fetch both sets with their flashcards
      const updatedOriginal = await tx.flashcardSet.findFirst({
        where: { id: setId },
        include: {
          flashcards: {
            orderBy: { sortOrder: 'asc' },
          },
        },
      });

      const updatedNew = await tx.flashcardSet.findFirst({
        where: { id: newSet.id },
        include: {
          flashcards: {
            orderBy: { sortOrder: 'asc' },
          },
        },
      });

      return { originalSet: updatedOriginal, newSet: updatedNew };
    });

    return createdResponse(result);
  } catch (err) {
    if (
      err instanceof Error &&
      (err.message === 'Flashcard set not found' ||
        err.message === 'One or more cardIds do not belong to this flashcard set' ||
        err.message === 'Cannot move all cards; at least one must remain in the original set')
    ) {
      return badRequestResponse(err.message);
    }
    return internalErrorResponse();
  }
}
