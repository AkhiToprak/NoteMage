import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { awardXP } from '@/lib/xp';
import { checkAndUnlockAchievements } from '@/lib/achievement-checker';
import {
  successResponse,
  unauthorizedResponse,
  internalErrorResponse,
} from '@/lib/api-response';

interface TutorialStateShape {
  step?: string;
  completedAt?: string;
  dismissedAt?: string;
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const existing = await db.user.findUnique({
      where: { id: userId },
      select: { tutorialState: true },
    });
    const current = (existing?.tutorialState ?? {}) as TutorialStateShape;

    if (current.completedAt) {
      return successResponse({
        tutorialState: current,
        xpAwarded: 0,
        leveledUp: false,
        newLevel: undefined,
        achievements: [] as { badge: string; name: string }[],
        alreadyComplete: true,
      });
    }

    const completedAt = new Date().toISOString();
    const next: TutorialStateShape = {
      ...current,
      step: 'complete',
      completedAt,
    };

    await db.user.update({
      where: { id: userId },
      data: { tutorialState: next as unknown as Prisma.InputJsonValue },
    });

    const xpResult = await awardXP(userId, 'tutorial_complete');
    const newAchievements = await checkAndUnlockAchievements(userId);

    return successResponse({
      tutorialState: next,
      xpAwarded: 50,
      newXP: xpResult.newXP,
      newLevel: xpResult.newLevel,
      leveledUp: xpResult.leveledUp,
      achievements: newAchievements,
      alreadyComplete: false,
    });
  } catch {
    return internalErrorResponse();
  }
}
