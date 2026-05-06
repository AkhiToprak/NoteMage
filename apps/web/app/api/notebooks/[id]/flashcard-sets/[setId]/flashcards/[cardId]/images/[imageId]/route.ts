import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { deleteFile } from '@/lib/storage';
import {
  successResponse,
  unauthorizedResponse,
  notFoundResponse,
  internalErrorResponse,
} from '@/lib/api-response';

type Params = { params: Promise<{ id: string; setId: string; cardId: string; imageId: string }> };

/**
 * DELETE – remove a single flashcard image
 */
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: notebookId, setId, cardId, imageId } = await params;

    const notebook = await db.notebook.findFirst({ where: { id: notebookId, userId } });
    if (!notebook) return notFoundResponse('Notebook not found');

    const flashcardSet = await db.flashcardSet.findFirst({ where: { id: setId, notebookId } });
    if (!flashcardSet) return notFoundResponse('Flashcard set not found');

    const card = await db.flashcard.findFirst({ where: { id: cardId, flashcardSetId: setId } });
    if (!card) return notFoundResponse('Flashcard not found');

    const image = await db.flashcardImage.findFirst({
      where: { id: imageId, flashcardId: cardId },
    });
    if (!image) return notFoundResponse('Image not found');

    // Delete file from disk
    await deleteFile(image.filePath);

    // Delete DB record
    await db.flashcardImage.delete({ where: { id: imageId } });

    return successResponse({ deleted: true });
  } catch {
    return internalErrorResponse();
  }
}
