import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
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

// `Exam.targetGradeNeutral` / `Exam.format` ship behind migration
// 20260630000000_exam_mode_foundations. Until it's applied, writing those
// columns throws Prisma P2022 ("column does not exist"); we retry the create
// without them so exam creation never 500s pre-migration (same pattern as
// /api/user/grading-system).
function isMissingColumn(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2022';
}

/**
 * GET – List all upcoming exams for the current user, sorted by examDate ascending.
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    // Defensive cap: bounds the upcoming-exams list (safety bound, not
    // user-facing pagination); keeps the soonest 500 upcoming exams.
    const exams = await db.exam.findMany({
      where: { userId, examDate: { gte: new Date() } },
      orderBy: { examDate: 'asc' },
      take: 500,
      include: {
        notebook: { select: { id: true, name: true } },
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

    const { title, examDate, notebookId, reminders, targetGradeNeutral, format } = body as {
      title?: string;
      examDate?: string;
      notebookId?: string;
      reminders?: boolean;
      targetGradeNeutral?: number | null;
      format?: string | null;
    };

    // Optional target grade — 0–100 on the neutral scale (see grading-systems.ts).
    let targetGrade: number | null = null;
    if (targetGradeNeutral != null) {
      if (typeof targetGradeNeutral !== 'number' || !Number.isFinite(targetGradeNeutral)) {
        return badRequestResponse('Invalid target grade');
      }
      targetGrade = Math.max(0, Math.min(100, targetGradeNeutral));
    }

    // Optional exam-day format — short free-form label.
    const examFormat =
      typeof format === 'string' && format.trim() ? format.trim().slice(0, 60) : null;

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
      return badRequestResponse('Study pack ID is required');
    }

    // Verify notebook belongs to user
    const notebook = await db.studyContainer.findFirst({
      where: { id: notebookId, userId },
    });
    if (!notebook) {
      return badRequestResponse('Study pack not found or does not belong to you');
    }

    const baseData = {
      userId,
      notebookId,
      title: title.trim(),
      examDate: parsedDate,
      reminders: reminders ?? true,
    };
    const include = { notebook: { select: { id: true, name: true } } } as const;

    let exam;
    try {
      exam = await db.exam.create({
        data: { ...baseData, targetGradeNeutral: targetGrade, format: examFormat },
        include,
      });
    } catch (err) {
      // Pre-migration fallback: create without the Exam Mode columns.
      if (!isMissingColumn(err)) throw err;
      exam = await db.exam.create({ data: baseData, include });
    }

    checkAndUnlockAchievements(userId).catch(console.error);

    return createdResponse(exam);
  } catch {
    return internalErrorResponse();
  }
}
