/**
 * Backfill: grant every user the cosmetics they're already eligible for at
 * their current level. Run once on prod after deploying the
 * achievement-driven unlock path, then delete this script.
 *
 * Silent — no `cosmetic_unlocked` notifications are created. Backfilled
 * grants represent cosmetics the user effectively already had; surfacing
 * them as fresh unlocks would spam every active account.
 *
 * Idempotent — re-running grants nothing new (createMany uses
 * skipDuplicates and the script diffs eligible vs. owned per user).
 *
 * Usage:
 *   npx tsx apps/web/scripts/backfill-cosmetics-from-levels.ts --dry-run
 *   npx tsx apps/web/scripts/backfill-cosmetics-from-levels.ts
 */

import { PrismaClient } from '@prisma/client';
import { COSMETICS } from '../src/lib/cosmetics/catalog';

const db = new PrismaClient();

const dryRun = process.argv.includes('--dry-run');

function eligibleCosmeticIds(level: number): string[] {
  return Object.values(COSMETICS)
    .filter((c) => !c.adminOnly && c.requiredLevel <= level)
    .map((c) => c.id);
}

async function main() {
  console.log(
    `Starting cosmetic backfill${dryRun ? ' (dry-run — no writes)' : ''}...\n`
  );

  const users = await db.user.findMany({
    select: { id: true, level: true },
  });

  if (users.length === 0) {
    console.log('No users found. Nothing to do.');
    return;
  }

  console.log(`Found ${users.length} user(s).\n`);

  let totalGranted = 0;
  let usersWithGrants = 0;
  let usersSkipped = 0;

  for (const user of users) {
    const eligibleIds = eligibleCosmeticIds(user.level);
    if (eligibleIds.length === 0) {
      usersSkipped++;
      continue;
    }

    const existing = await db.userCosmetic.findMany({
      where: { userId: user.id, cosmeticId: { in: eligibleIds } },
      select: { cosmeticId: true },
    });
    const ownedSet = new Set(existing.map((r) => r.cosmeticId));
    const toGrant = eligibleIds.filter((id) => !ownedSet.has(id));

    if (toGrant.length === 0) {
      usersSkipped++;
      continue;
    }

    if (dryRun) {
      console.log(
        `[dry-run] user=${user.id} level=${user.level} would grant ${toGrant.length}: ${toGrant.join(', ')}`
      );
    } else {
      await db.userCosmetic.createMany({
        data: toGrant.map((cosmeticId) => ({ userId: user.id, cosmeticId })),
        skipDuplicates: true,
      });
      console.log(
        `granted user=${user.id} level=${user.level} count=${toGrant.length}`
      );
    }

    totalGranted += toGrant.length;
    usersWithGrants++;
  }

  console.log('\n' + '─'.repeat(50));
  console.log(`Users processed:  ${users.length}`);
  console.log(`Users with grants: ${usersWithGrants}`);
  console.log(`Users skipped:    ${usersSkipped} (already had everything they're eligible for)`);
  console.log(
    `Cosmetics ${dryRun ? 'that would be granted' : 'granted'}: ${totalGranted}`
  );
}

main()
  .catch((err) => {
    console.error('Backfill failed:', err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
