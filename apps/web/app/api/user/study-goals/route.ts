import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  successResponse,
  badRequestResponse,
  unauthorizedResponse,
  internalErrorResponse,
} from '@/lib/api-response';
import { validateGoals } from '@/lib/study-goals';

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        dailyStudyMinutesGoal: true,
        weeklyStudyPlansGoal: true,
        weeklyNotesGoal: true,
        weeklyChatsGoal: true,
      },
    });

    return successResponse(
      user ?? {
        dailyStudyMinutesGoal: null,
        weeklyStudyPlansGoal: null,
        weeklyNotesGoal: null,
        weeklyChatsGoal: null,
      }
    );
  } catch {
    return internalErrorResponse();
  }
}

export async function PUT(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const body = await request.json().catch(() => ({}));
    const result = validateGoals(body);
    if (!result.ok) return badRequestResponse(result.error);

    const updated = await db.user.update({
      where: { id: userId },
      data: result.data,
      select: {
        dailyStudyMinutesGoal: true,
        weeklyStudyPlansGoal: true,
        weeklyNotesGoal: true,
        weeklyChatsGoal: true,
      },
    });

    return successResponse(updated);
  } catch {
    return internalErrorResponse();
  }
}
