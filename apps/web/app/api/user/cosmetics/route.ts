import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { getLevelFromXP } from '@/lib/xp';
import { checkCosmeticUnlocks } from '@/lib/cosmetics/unlock';
import { successResponse, unauthorizedResponse, internalErrorResponse } from '@/lib/api-response';

/**
 * GET /api/user/cosmetics
 *
 * Returns the authenticated user's unlocked cosmetics plus the level data the
 * profile customization UI needs to render locked states.
 *
 * The catalog itself lives in code (`src/lib/cosmetics/catalog.ts`) and is
 * imported directly on the client — we only round-trip the user-specific bits.
 *
 * Shape:
 * {
 *   level: number,       // computed from total XP
 *   owned: string[],     // cosmetic slugs the user has in UserCosmetic
 *   unlockedAt: Record<string, string>, // slug -> ISO timestamp of unlock,
 *                                       // used by the UI to show a NEW badge
 * }
 *
 * Equipped IDs are already returned by GET /api/user/profile, so we don't
 * re-include them here.
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    // Backfill: make sure every cosmetic the user is currently eligible for
    // has a UserCosmetic row. Critical for accounts that leveled up BEFORE
    // the cosmetics system was deployed (their awardXP calls never ran the
    // unlock pipeline, so their catalog is empty even at high levels) and
    // cheap otherwise thanks to the skipDuplicates insert + idempotent
    // ownership check inside checkCosmeticUnlocks.
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { xp: true },
    });
    if (!user) return unauthorizedResponse();

    const { level } = getLevelFromXP(user.xp);
    await checkCosmeticUnlocks(userId, level).catch(() => {});

    const owned = await db.userCosmetic.findMany({
      where: { userId },
      select: { cosmeticId: true, unlockedAt: true },
      orderBy: { unlockedAt: 'asc' },
    });

    const unlockedAt: Record<string, string> = {};
    for (const row of owned) {
      unlockedAt[row.cosmeticId] = row.unlockedAt.toISOString();
    }

    return successResponse({
      level,
      owned: owned.map((row) => row.cosmeticId),
      unlockedAt,
    });
  } catch {
    return internalErrorResponse();
  }
}
