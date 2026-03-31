import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { sm2 } from '@/lib/spaced-repetition';
import { recordActivity } from '@/lib/activity';
import {
  successResponse,
  badRequestResponse,
  unauthorizedResponse,
  notFoundResponse,
  internalErrorResponse,
} from '@/lib/api-response';

type Params = { params: Promise<{ id: string; setId: string }> };

/**
 * POST – review a flashcard using SM-2 spaced repetition
 * Body: { flashcardId: string, quality: number } (quality 0-5)
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: notebookId, setId } = await params;

    const notebook = await db.notebook.findFirst({ where: { id: notebookId, userId } });
    if (!notebook) return notFoundResponse('Notebook not found');

    const body = await request.json();
    const { flashcardId, quality } = body;

    if (!flashcardId || typeof quality !== 'number' || quality < 0 || quality > 5) {
      return badRequestResponse('flashcardId (string) and quality (0-5) are required');
    }

    const flashcard = await db.flashcard.findFirst({
      where: { id: flashcardId, flashcardSetId: setId },
    });
    if (!flashcard) return notFoundResponse('Flashcard not found in this set');

    const result = sm2(
      quality,
      flashcard.easeFactor,
      flashcard.interval,
      flashcard.repetitions
    );

    const updated = await db.flashcard.update({
      where: { id: flashcardId },
      data: {
        easeFactor: result.easeFactor,
        interval: result.interval,
        repetitions: result.repetitions,
        nextReviewAt: result.nextReviewAt,
        lastReviewAt: new Date(),
      },
    });

    recordActivity(userId, 'flashcard_review').catch(() => {});

    return successResponse(updated);
  } catch {
    return internalErrorResponse();
  }
}
