import { db } from '@/lib/db';
import { getAchievementDef } from '@/lib/achievements';
import { COSMETICS } from './catalog';

/** Grants cosmetics from `def.unlocks`. Idempotent. */
export async function unlockCosmeticsForAchievement(
  userId: string,
  achievementKey: string
): Promise<void> {
  const def = getAchievementDef(achievementKey);
  if (!def) return;

  const cosmeticIds = def.unlocks;
  if (cosmeticIds.length === 0) return;

  // Drop unknown ids defensively — a typo in the mapping shouldn't insert dead rows.
  const validIds = cosmeticIds.filter((id) => COSMETICS[id] !== undefined);
  if (validIds.length === 0) return;

  // Pre-filter owned to suppress duplicate notifications on re-checks.
  const existing = await db.userCosmetic.findMany({
    where: { userId, cosmeticId: { in: validIds } },
    select: { cosmeticId: true },
  });
  const ownedSet = new Set(existing.map((r) => r.cosmeticId));
  const newlyUnlocked = validIds.filter((id) => !ownedSet.has(id));

  if (newlyUnlocked.length === 0) return;

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
            source: 'achievement',
            achievementKey,
          },
        };
      }),
    }),
  ]);
}
