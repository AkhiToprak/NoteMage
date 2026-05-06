import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { successResponse, unauthorizedResponse, internalErrorResponse } from '@/lib/api-response';

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const flashcardSets = await db.flashcardSet.findMany({
      where: { notebook: { userId } },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        title: true,
        notebookId: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { flashcards: true } },
        notebook: { select: { name: true, color: true } },
      },
    });

    return successResponse(flashcardSets);
  } catch {
    return internalErrorResponse();
  }
}
