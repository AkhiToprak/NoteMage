import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { successResponse, unauthorizedResponse, internalErrorResponse } from '@/lib/api-response';

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const streak = await db.userStreak.findUnique({ where: { userId } });

    if (!streak || streak.freezesLeft <= 0) {
      return new Response(JSON.stringify({ error: 'No freezes available' }), { status: 400 });
    }

    const updated = await db.userStreak.update({
      where: { userId },
      data: {
        freezesLeft: { decrement: 1 },
        freezesUsed: { increment: 1 },
      },
    });

    return successResponse({
      currentStreak: updated.currentStreak,
      longestStreak: updated.longestStreak,
      freezesLeft: updated.freezesLeft,
      freezesUsed: updated.freezesUsed,
    });
  } catch {
    return internalErrorResponse();
  }
}
