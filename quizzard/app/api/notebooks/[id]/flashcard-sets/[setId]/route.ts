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

type Params = { params: Promise<{ id: string; setId: string }> };

/**
 * GET – fetch a flashcard set with all its cards
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
      include: {
        flashcards: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
    if (!flashcardSet) return notFoundResponse('Flashcard set not found');

    return successResponse(flashcardSet);
  } catch {
    return internalErrorResponse();
  }
}

/**
 * PATCH – update a flashcard set (e.g. assign to a section)
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: notebookId, setId } = await params;

    const notebook = await db.notebook.findFirst({ where: { id: notebookId, userId } });
    if (!notebook) return notFoundResponse('Notebook not found');

    const flashcardSet = await db.flashcardSet.findFirst({ where: { id: setId, notebookId } });
    if (!flashcardSet) return notFoundResponse('Flashcard set not found');

    const body = await request.json();
    const { sectionId } = body;

    // Allow null to unlink from section
    if (sectionId !== null && sectionId !== undefined) {
      const section = await db.section.findFirst({ where: { id: sectionId, notebookId } });
      if (!section) return badRequestResponse('Section not found in this notebook');
    }

    const updated = await db.flashcardSet.update({
      where: { id: setId },
      data: { sectionId: sectionId ?? null },
      include: { flashcards: { orderBy: { sortOrder: 'asc' } } },
    });

    return successResponse(updated);
  } catch {
    return internalErrorResponse();
  }
}

/**
 * DELETE – delete a flashcard set and all its cards
 */
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: notebookId, setId } = await params;

    const notebook = await db.notebook.findFirst({ where: { id: notebookId, userId } });
    if (!notebook) return notFoundResponse('Notebook not found');

    const flashcardSet = await db.flashcardSet.findFirst({ where: { id: setId, notebookId } });
    if (!flashcardSet) return notFoundResponse('Flashcard set not found');

    await db.flashcardSet.delete({ where: { id: setId } });

    return successResponse({ deleted: true });
  } catch {
    return internalErrorResponse();
  }
}
