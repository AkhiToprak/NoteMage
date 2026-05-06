import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { getLevelFromXP, xpForLevel } from '@/lib/xp';
import { db } from '@/lib/db';
import { successResponse, unauthorizedResponse, internalErrorResponse } from '@/lib/api-response';

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { xp: true, level: true },
    });

    if (!user) return unauthorizedResponse();

    const { level, currentXP, nextLevelXP } = getLevelFromXP(user.xp);

    return successResponse({
      totalXP: user.xp,
      level,
      currentLevelXP: currentXP,
      nextLevelXP,
      xpForCurrentLevel: xpForLevel(level),
    });
  } catch {
    return internalErrorResponse();
  }
}
