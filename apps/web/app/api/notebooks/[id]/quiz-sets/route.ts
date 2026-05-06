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
 * GET – list all quiz sets in a notebook
 */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: notebookId } = await params;

    const notebook = await db.notebook.findFirst({ where: { id: notebookId, userId } });
    if (!notebook) return notFoundResponse('Notebook not found');

    const sets = await db.quizSet.findMany({
      where: { notebookId },
      include: {
        _count: { select: { questions: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return successResponse(sets);
  } catch {
    return internalErrorResponse();
  }
}

/**
 * POST – create a new quiz set manually
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: notebookId } = await params;

    const notebook = await db.notebook.findFirst({ where: { id: notebookId, userId } });
    if (!notebook) return notFoundResponse('Notebook not found');

    const body = await request.json();
    const { title, sectionId, questions } = body as {
      title: string;
      sectionId?: string;
      questions?: { question: string; options: string[]; correctIndex: number; hint?: string }[];
    };

    if (!title || typeof title !== 'string' || !title.trim()) {
      return badRequestResponse('Title is required');
    }

    if (title.length > 500) {
      return badRequestResponse('Title must be 500 characters or less');
    }

    if (questions && questions.length > 2000) {
      return badRequestResponse('Too many questions. Maximum is 2000 per set.');
    }

    if (questions) {
      for (const q of questions) {
        if (!q.question || typeof q.question !== 'string' || !q.question.trim()) {
          return badRequestResponse('Each question must have text');
        }
        if (!Array.isArray(q.options) || q.options.length !== 4) {
          return badRequestResponse('Each question must have exactly 4 options');
        }
        if (q.options.some((o: string) => !o || typeof o !== 'string' || !o.trim())) {
          return badRequestResponse('All options must be non-empty strings');
        }
        if (typeof q.correctIndex !== 'number' || q.correctIndex < 0 || q.correctIndex > 3) {
          return badRequestResponse('correctIndex must be 0, 1, 2, or 3');
        }
      }
    }

    if (sectionId) {
      const section = await db.section.findFirst({ where: { id: sectionId, notebookId } });
      if (!section) return badRequestResponse('Section not found in this notebook');
    }

    const set = await db.quizSet.create({
      data: {
        notebookId,
        title: title.trim(),
        sectionId: sectionId || null,
        chatId: null,
        messageId: null,
        questions: questions?.length
          ? {
              create: questions.map((q, i) => ({
                question: q.question.trim(),
                options: q.options.map((o: string) => o.trim()),
                correctIndex: q.correctIndex,
                hint: q.hint?.trim() || null,
                sortOrder: i,
              })),
            }
          : undefined,
      },
      include: { questions: true },
    });

    return createdResponse(set);
  } catch {
    return internalErrorResponse();
  }
}
