import { db } from '@/lib/db';
import { checkAndUnlockAchievements } from '@/lib/achievement-checker';
import { checkCosmeticUnlocks } from '@/lib/cosmetics/unlock';

export const XP_REWARDS = {
  message_sent: 5,
  page_created: 10,
  page_edited: 3,
  document_uploaded: 15,
  quiz_completed: 20,
  quiz_perfect_score: 50,
  flashcard_reviewed: 2,
  flashcard_set_completed: 25,
  notebook_published: 30,
  streak_milestone_7: 100,
  streak_milestone_30: 500,
  streak_milestone_100: 2000,
} as const;

export type XPAction = keyof typeof XP_REWARDS;

// Level thresholds (exponential curve)
export function xpForLevel(level: number): number {
  return Math.floor(100 * Math.pow(1.5, level - 1));
}

export function getLevelFromXP(totalXP: number): {
  level: number;
  currentXP: number;
  nextLevelXP: number;
} {
  let level = 1;
  let remaining = totalXP;
  while (remaining >= xpForLevel(level)) {
    remaining -= xpForLevel(level);
    level++;
  }
  return { level, currentXP: remaining, nextLevelXP: xpForLevel(level) };
}

export async function awardXP(
  userId: string,
  action: XPAction
): Promise<{ newXP: number; newLevel: number; leveledUp: boolean }> {
  const amount = XP_REWARDS[action];

  // Atomically increment XP
  const user = await db.user.update({
    where: { id: userId },
    data: { xp: { increment: amount } },
    select: { xp: true, level: true },
  });

  // Calculate new level from total XP
  const { level: calculatedLevel } = getLevelFromXP(user.xp);
  const leveledUp = calculatedLevel > user.level;

  // If level changed, update user and create notification
  if (leveledUp) {
    await db.user.update({
      where: { id: userId },
      data: { level: calculatedLevel },
    });

    await db.notification.create({
      data: {
        userId,
        type: 'level_up',
        data: { newLevel: calculatedLevel },
      },
    });

    checkAndUnlockAchievements(userId).catch(console.error);
    checkCosmeticUnlocks(userId, calculatedLevel).catch(console.error);
  }

  return { newXP: user.xp, newLevel: calculatedLevel, leveledUp };
}
