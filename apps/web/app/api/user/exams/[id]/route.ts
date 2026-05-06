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

type Params = { params: Promise<{ id: string }> };

/**
 * GET – Get exam detail with notebook info and linked study plan.
 */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id } = await params;

    const exam = await db.exam.findFirst({
      where: { id, userId },
      include: {
        notebook: { select: { id: true, name: true } },
        studyPlan: {
          include: {
            phases: {
              orderBy: { sortOrder: 'asc' },
              include: { materials: { orderBy: { sortOrder: 'asc' } } },
            },
          },
        },
      },
    });

    if (!exam) return notFoundResponse('Exam not found');

    return successResponse(exam);
  } catch {
    return internalErrorResponse();
  }
}

/**
 * PUT – Update an exam (title, examDate, reminders). Verify ownership.
 */
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id } = await params;

    const existing = await db.exam.findFirst({ where: { id, userId } });
    if (!existing) return notFoundResponse('Exam not found');

    const body = await request.json().catch(() => null);
    if (!body) return badRequestResponse('Invalid JSON body');

    const { title, examDate, reminders } = body as {
      title?: string;
      examDate?: string;
      reminders?: boolean;
    };

    const data: Record<string, unknown> = {};

    if (title !== undefined) {
      if (!title.trim()) return badRequestResponse('Title cannot be empty');
      data.title = title.trim();
    }

    if (examDate !== undefined) {
      const parsedDate = new Date(examDate);
      if (isNaN(parsedDate.getTime())) {
        return badRequestResponse('Invalid exam date');
      }
      if (parsedDate <= new Date()) {
        return badRequestResponse('Exam date must be in the future');
      }
      data.examDate = parsedDate;
    }

    if (reminders !== undefined) {
      data.reminders = reminders;
    }

    const updated = await db.exam.update({
      where: { id },
      data,
      include: {
        notebook: { select: { id: true, name: true } },
        studyPlan: { select: { id: true } },
      },
    });

    return successResponse(updated);
  } catch {
    return internalErrorResponse();
  }
}

/**
 * DELETE – Delete an exam. Verify ownership.
 */
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id } = await params;

    const existing = await db.exam.findFirst({ where: { id, userId } });
    if (!existing) return notFoundResponse('Exam not found');

    await db.exam.delete({ where: { id } });

    return successResponse({ deleted: true });
  } catch {
    return internalErrorResponse();
  }
}
