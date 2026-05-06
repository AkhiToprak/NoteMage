import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  successResponse,
  badRequestResponse,
  unauthorizedResponse,
  internalErrorResponse,
} from '@/lib/api-response';

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { dailyGoal: true },
    });

    if (!user) return unauthorizedResponse();
    return successResponse({ dailyGoal: user.dailyGoal });
  } catch {
    return internalErrorResponse();
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const body = await request.json();
    const { dailyGoal } = body;

    if (typeof dailyGoal !== 'number' || dailyGoal < 1 || dailyGoal > 200) {
      return badRequestResponse('dailyGoal must be a number between 1 and 200');
    }

    const updated = await db.user.update({
      where: { id: userId },
      data: { dailyGoal: Math.round(dailyGoal) },
      select: { dailyGoal: true },
    });

    return successResponse(updated);
  } catch {
    return internalErrorResponse();
  }
}
