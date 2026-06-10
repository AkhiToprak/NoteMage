import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { successResponse, unauthorizedResponse, internalErrorResponse } from '@/lib/api-response';
import { db } from '@/lib/db';
import { ACHIEVEMENTS } from '@/lib/achievements';
import { checkAndUnlockAchievements, gatherUserStats } from '@/lib/achievement-checker';

export async function GET(request: NextRequest) {
  try {
    const authUserId = await getAuthUserId(request);
    if (!authUserId) return unauthorizedResponse();

    // Support viewing another user's achievements via ?userId= query param
    const { searchParams } = new URL(request.url);
    const targetUserId = searchParams.get('userId');

    // If viewing another user's achievements, return read-only data (no unlock check)
    if (targetUserId && targetUserId !== authUserId) {
      // Privacy gate: hide the list when the target hides achievements, or
      // their profile is private and the viewer isn't an accepted friend.
      // Mirrors /api/user/profile/[username] + /api/schools/peers.
      const target = await db.user.findUnique({
        where: { id: targetUserId },
        select: { profilePrivate: true, hideAchievements: true },
      });

      const emptyResult = successResponse({
        unlocked: [],
        locked: [],
        total: ACHIEVEMENTS.length,
        unlockedCount: 0,
        progress: [],
      });

      // Unknown user, or the target hides achievements → return nothing.
      if (!target || target.hideAchievements) return emptyResult;

      // Private profile → only an accepted friend may see the achievements.
      if (target.profilePrivate) {
        const friendship = await db.friendship.findFirst({
          where: {
            status: 'accepted',
            OR: [
              { requesterId: authUserId, addresseeId: targetUserId },
              { requesterId: targetUserId, addresseeId: authUserId },
            ],
          },
          select: { id: true },
        });
        if (!friendship) return emptyResult;
      }

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

    // Own achievements: run the checker to auto-unlock any new ones, then fetch state
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
