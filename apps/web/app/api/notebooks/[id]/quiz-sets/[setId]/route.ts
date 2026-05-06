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
 * GET – fetch a quiz set with all its questions
 */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: notebookId, setId } = await params;

    const notebook = await db.notebook.findFirst({ where: { id: notebookId, userId } });
    if (!notebook) return notFoundResponse('Notebook not found');

    const quizSet = await db.quizSet.findFirst({
      where: { id: setId, notebookId },
      include: {
        questions: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
    if (!quizSet) return notFoundResponse('Quiz set not found');

    return successResponse(quizSet);
  } catch {
    return internalErrorResponse();
  }
}

/**
 * PATCH – update a quiz set (e.g. assign to a section)
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: notebookId, setId } = await params;

    const notebook = await db.notebook.findFirst({ where: { id: notebookId, userId } });
    if (!notebook) return notFoundResponse('Notebook not found');

    const quizSet = await db.quizSet.findFirst({ where: { id: setId, notebookId } });
    if (!quizSet) return notFoundResponse('Quiz set not found');

    const body = await request.json();
    const { sectionId } = body;

    if (sectionId !== null && sectionId !== undefined) {
      const section = await db.section.findFirst({ where: { id: sectionId, notebookId } });
      if (!section) return badRequestResponse('Section not found in this notebook');
    }

    const updated = await db.quizSet.update({
      where: { id: setId },
      data: { sectionId: sectionId ?? null },
      include: { questions: { orderBy: { sortOrder: 'asc' } } },
    });

    return successResponse(updated);
  } catch {
    return internalErrorResponse();
  }
}

/**
 * DELETE – delete a quiz set and all its questions
 */
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: notebookId, setId } = await params;

    const notebook = await db.notebook.findFirst({ where: { id: notebookId, userId } });
    if (!notebook) return notFoundResponse('Notebook not found');

    const quizSet = await db.quizSet.findFirst({ where: { id: setId, notebookId } });
    if (!quizSet) return notFoundResponse('Quiz set not found');

    await db.quizSet.delete({ where: { id: setId } });

    return successResponse({ deleted: true });
  } catch {
    return internalErrorResponse();
  }
}
