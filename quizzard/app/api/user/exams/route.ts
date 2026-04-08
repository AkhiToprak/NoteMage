import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  successResponse,
  createdResponse,
  badRequestResponse,
  unauthorizedResponse,
  internalErrorResponse,
} from '@/lib/api-response';
import { checkAndUnlockAchievements } from '@/lib/achievement-checker';

/**
 * GET – List all upcoming exams for the current user, sorted by examDate ascending.
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const exams = await db.exam.findMany({
      where: { userId, examDate: { gte: new Date() } },
      orderBy: { examDate: 'asc' },
      include: {
        notebook: { select: { id: true, name: true } },
        studyPlan: { select: { id: true } },
      },
    });

    return successResponse(exams);
  } catch {
    return internalErrorResponse();
  }
}

/**
 * POST – Create a new exam.
 * Body: { title, examDate, notebookId, reminders? }
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const body = await request.json().catch(() => null);
    if (!body) return badRequestResponse('Invalid JSON body');

    const { title, examDate, notebookId, reminders } = body as {
      title?: string;
      examDate?: string;
      notebookId?: string;
      reminders?: boolean;
    };

    if (!title || !title.trim()) {
      return badRequestResponse('Title is required');
    }

    if (!examDate) {
      return badRequestResponse('Exam date is required');
    }

    const parsedDate = new Date(examDate);
    if (isNaN(parsedDate.getTime())) {
      return badRequestResponse('Invalid exam date');
    }

    if (parsedDate <= new Date()) {
      return badRequestResponse('Exam date must be in the future');
    }

    if (!notebookId) {
      return badRequestResponse('Notebook ID is required');
    }

    // Verify notebook belongs to user
    const notebook = await db.notebook.findFirst({
      where: { id: notebookId, userId },
    });
    if (!notebook) {
      return badRequestResponse('Notebook not found or does not belong to you');
    }

    const exam = await db.exam.create({
      data: {
        userId,
        notebookId,
        title: title.trim(),
        examDate: parsedDate,
        reminders: reminders ?? true,
      },
      include: {
        notebook: { select: { id: true, name: true } },
        studyPlan: { select: { id: true } },
      },
    });

    checkAndUnlockAchievements(userId).catch(console.error);

    return createdResponse(exam);
  } catch {
    return internalErrorResponse();
  }
}
