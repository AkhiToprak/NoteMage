import { db } from '@/lib/db';
import { COSMETICS, eligibleCosmeticIds } from './catalog';

/**
 * Grants the user every cosmetic they've become eligible for at `newLevel`
 * that they don't already own, and creates a `cosmetic_unlocked`
 * notification for each newly granted entry.
 *
 * Intentionally idempotent: if called twice with the same level, the second
 * call inserts nothing because skipDuplicates filters already-owned rows
 * and the notification query only sees truly-new unlocks.
 *
 * Called from awardXP() right after level calculation. Fire-and-forget —
 * any DB error is logged but never crashes the XP award path.
 */
export async function checkCosmeticUnlocks(
  userId: string,
  newLevel: number
): Promise<{ newlyUnlocked: string[] }> {
  const eligibleIds = eligibleCosmeticIds(newLevel);
  if (eligibleIds.length === 0) return { newlyUnlocked: [] };

  // Figure out which of the eligible cosmetics the user doesn't already own.
  const existing = await db.userCosmetic.findMany({
    where: { userId, cosmeticId: { in: eligibleIds } },
    select: { cosmeticId: true },
  });
  const ownedSet = new Set(existing.map((r) => r.cosmeticId));
  const newlyUnlocked = eligibleIds.filter((id) => !ownedSet.has(id));

  if (newlyUnlocked.length === 0) return { newlyUnlocked: [] };

  // Insert unlock rows + one notification per unlock. skipDuplicates keeps
  // this race-safe if two awardXP calls for the same user run concurrently.
  await db.$transaction([
    db.userCosmetic.createMany({
      data: newlyUnlocked.map((cosmeticId) => ({ userId, cosmeticId })),
      skipDuplicates: true,
    }),
    db.notification.createMany({
      data: newlyUnlocked.map((cosmeticId) => {
        const entry = COSMETICS[cosmeticId];
        return {
          userId,
          type: 'cosmetic_unlocked',
          data: {
            cosmeticId,
            label: entry?.label ?? cosmeticId,
            cosmeticType: entry?.type ?? 'unknown',
          },
        };
      }),
    }),
  ]);

  return { newlyUnlocked };
}
