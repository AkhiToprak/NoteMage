import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { successResponse, unauthorizedResponse, internalErrorResponse } from '@/lib/api-response';
import { db } from '@/lib/db';
import { ACHIEVEMENTS } from '@/lib/achievements';
import { checkAndUnlockAchievements, gatherUserStats } from '@/lib/achievement-checker';

export async function GET(request: NextRequest) {
  try {
    const authUserId = await getAuthUserId(request);

    // Support viewing another user's achievements via ?userId= query param
    const { searchParams } = new URL(request.url);
    const targetUserId = searchParams.get('userId');

    // If viewing another user's achievements, return read-only data (no unlock check)
    if (targetUserId && targetUserId !== authUserId) {
      const unlockedRecords = await db.achievement.findMany({
        where: { userId: targetUserId },
        select: { badge: true, unlockedAt: true },
        orderBy: { unlockedAt: 'desc' },
      });

      const unlockedBadges = new Set(unlockedRecords.map((r) => r.badge));
      const unlockedMap = new Map(unlockedRecords.map((r) => [r.badge, r.unlockedAt]));

      const unlocked: {
        badge: string;
        name: string;
        description: string;
        icon: string;
        category: string;
        unlockedAt: Date;
      }[] = [];

      for (const def of ACHIEVEMENTS) {
        if (unlockedBadges.has(def.badge)) {
          unlocked.push({
            badge: def.badge,
            name: def.name,
            description: def.description,
            icon: def.icon,
            category: def.category,
            unlockedAt: unlockedMap.get(def.badge)!,
          });
        }
      }

      return successResponse({
        unlocked,
        locked: [],
        total: ACHIEVEMENTS.length,
        unlockedCount: unlocked.length,
        progress: [],
      });
    }

    // Own achievements: require auth
    if (!authUserId) return unauthorizedResponse();

    // Run the checker to auto-unlock any new achievements, then fetch state
    await checkAndUnlockAchievements(authUserId);

    const [unlockedRecords, stats] = await Promise.all([
      db.achievement.findMany({
        where: { userId: authUserId },
        select: { badge: true, unlockedAt: true },
        orderBy: { unlockedAt: 'desc' },
      }),
      gatherUserStats(authUserId),
    ]);

    const unlockedBadges = new Set(unlockedRecords.map((r) => r.badge));
    const unlockedMap = new Map(unlockedRecords.map((r) => [r.badge, r.unlockedAt]));

    const unlocked: {
      badge: string;
      name: string;
      description: string;
      icon: string;
      category: string;
      unlockedAt: Date;
    }[] = [];

    const locked: {
      badge: string;
      name: string;
      description: string;
      icon: string;
      category: string;
      progress: { current: number; target: number };
    }[] = [];

    for (const def of ACHIEVEMENTS) {
      if (unlockedBadges.has(def.badge)) {
        unlocked.push({
          badge: def.badge,
          name: def.name,
          description: def.description,
          icon: def.icon,
          category: def.category,
          unlockedAt: unlockedMap.get(def.badge)!,
        });
      } else {
        locked.push({
          badge: def.badge,
          name: def.name,
          description: def.description,
          icon: def.icon,
          category: def.category,
          progress: def.getProgress(stats),
        });
      }
    }

    return successResponse({
      unlocked,
      locked,
      total: ACHIEVEMENTS.length,
      unlockedCount: unlocked.length,
      progress: locked.map((item) => ({
        badge: item.badge,
        current: item.progress.current,
        target: item.progress.target,
      })),
    });
  } catch {
    return internalErrorResponse();
  }
}
