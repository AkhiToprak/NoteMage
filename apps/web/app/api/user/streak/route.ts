import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { getStreakInfo } from '@/lib/streaks';
import { successResponse, unauthorizedResponse, internalErrorResponse } from '@/lib/api-response';

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const streak = await getStreakInfo(userId);
    return successResponse(streak);
  } catch {
    return internalErrorResponse();
  }
}
