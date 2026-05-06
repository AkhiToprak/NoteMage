import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  successResponse,
  createdResponse,
  badRequestResponse,
  unauthorizedResponse,
  notFoundResponse,
  internalErrorResponse,
} from '@/lib/api-response';

type Params = { params: Promise<{ id: string }> };

/**
 * GET – list all flashcard sets in a notebook
 */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: notebookId } = await params;

    const notebook = await db.notebook.findFirst({ where: { id: notebookId, userId } });
    if (!notebook) return notFoundResponse('Notebook not found');

    const sets = await db.flashcardSet.findMany({
      where: { notebookId },
      include: {
        _count: { select: { flashcards: true } },
        flashcards: { orderBy: { sortOrder: 'asc' } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return successResponse(sets);
  } catch {
    return internalErrorResponse();
  }
}

/**
 * POST – create a new flashcard set manually
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: notebookId } = await params;

    const notebook = await db.notebook.findFirst({ where: { id: notebookId, userId } });
    if (!notebook) return notFoundResponse('Notebook not found');

    const body = await request.json();
    const { title, sectionId, source, cards } = body as {
      title: string;
      sectionId?: string;
      source?: string;
      cards?: { question: string; answer: string }[];
    };

    if (!title || typeof title !== 'string' || !title.trim()) {
      return badRequestResponse('Title is required');
    }

    if (title.length > 500) {
      return badRequestResponse('Title must be 500 characters or less');
    }

    if (cards && cards.length > 20000) {
      return badRequestResponse('Too many cards. Maximum is 20000 per set.');
    }

    if (cards) {
      for (const c of cards) {
        if (typeof c.question === 'string' && c.question.length > 50000) {
          return badRequestResponse('Card question must be 50000 characters or less');
        }
        if (typeof c.answer === 'string' && c.answer.length > 50000) {
          return badRequestResponse('Card answer must be 50000 characters or less');
        }
      }
    }

    if (sectionId) {
      const section = await db.section.findFirst({ where: { id: sectionId, notebookId } });
      if (!section) return badRequestResponse('Section not found in this notebook');
    }

    const set = await db.flashcardSet.create({
      data: {
        notebookId,
        title: title.trim(),
        source: source || 'manual',
        sectionId: sectionId || null,
        chatId: null,
        messageId: null,
        flashcards: cards?.length
          ? {
              create: cards.map((c, i) => ({
                question: c.question.trim(),
                answer: c.answer.trim(),
                sortOrder: i,
              })),
            }
          : undefined,
      },
      include: { flashcards: true },
    });

    return createdResponse(set);
  } catch {
    return internalErrorResponse();
  }
}
