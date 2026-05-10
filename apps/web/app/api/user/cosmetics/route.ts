import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { successResponse, unauthorizedResponse, internalErrorResponse } from '@/lib/api-response';

/**
 * GET /api/user/cosmetics
 *
 * Returns the authenticated user's unlocked cosmetics. The catalog itself
 * lives in code (`src/lib/cosmetics/catalog.ts`) and is imported directly on
 * the client — we only round-trip the user-specific bits.
 *
 * Shape:
 * {
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
      owned: owned.map((row) => row.cosmeticId),
      unlockedAt,
    });
  } catch {
    return internalErrorResponse();
  }
}
