import { db } from '@/lib/db';
import { getAchievementDef } from '@/lib/achievements';
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

/**
 * Grants every cosmetic mapped to `achievementKey` that the user doesn't
 * already own, and emits one `cosmetic_unlocked` notification per grant.
 *
 * Called from the achievement checker right after a new `Achievement` row is
 * created. Designed to run in parallel with the legacy
 * `checkCosmeticUnlocks(userId, newLevel)` path during PR 1 — both write to
 * `UserCosmetic` and rely on its compound PK for idempotency. PR 3 deletes
 * the level path entirely.
 *
 * Idempotent. Safe to call again with the same key — `skipDuplicates` on the
 * cosmetic insert plus a pre-filter on owned ids keeps notifications from
 * double-firing.
 */
export async function unlockCosmeticsForAchievement(
  userId: string,
  achievementKey: string,
): Promise<void> {
  const def = getAchievementDef(achievementKey);
  if (!def) return;

  const cosmeticIds = def.unlocks;
  if (cosmeticIds.length === 0) return;

  // Drop ids that aren't in the catalog so a typo in the achievement
  // mapping can't crash the unlock pipeline. Renderers ignore unknown
  // slugs anyway, but we'd still rather not insert dead rows.
  const validIds = cosmeticIds.filter((id) => COSMETICS[id] !== undefined);
  if (validIds.length === 0) return;

  // Skip rows the user already owns so we don't fire a duplicate
  // notification on re-checks. The DB still has skipDuplicates as a
  // safety net for race conditions.
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
            // Source tag lets the toast / notification UI distinguish
            // achievement-driven unlocks from level-driven ones if it
            // wants to. PR 3 will drop the level source entirely.
            source: 'achievement',
            achievementKey,
          },
        };
      }),
    }),
  ]);
}
