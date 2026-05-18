import { db } from '@/lib/db';
import { TIERS, getMonthStart, isLifetimeLimit } from '@/lib/tiers';
import type { FeatureType, TierKey } from '@/lib/tiers';

interface UsageLimitResult {
  allowed: boolean;
  used: number;
  limit: number; // -1 = unlimited
}

export async function checkUsageLimit(
  userId: string,
  featureType: FeatureType
): Promise<UsageLimitResult> {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { tier: true, role: true },
  });

  // Admins have unlimited everything
  if (user.role === 'admin') {
    return { allowed: true, used: 0, limit: -1 };
  }

  const tier = user.tier as TierKey;
  const limit = TIERS[tier].limits[featureType];

  // Unlimited
  if (limit === -1) {
    return { allowed: true, used: 0, limit: -1 };
  }

  let used: number;
  if (isLifetimeLimit(tier, featureType)) {
    // Lifetime allowance — sum every month's usage; it never resets.
    const agg = await db.usageRecord.aggregate({
      where: { userId, featureType },
      _sum: { count: true },
    });
    used = agg._sum.count ?? 0;
  } else {
    const record = await db.usageRecord.findUnique({
      where: {
        userId_featureType_month: { userId, featureType, month: getMonthStart() },
      },
    });
    used = record?.count ?? 0;
  }

  return { allowed: used < limit, used, limit };
}

/**
 * Add `amount` (default 1) to a user's usage for the current month.
 * Lifetime-scoped features still write to the current month's row — the
 * lifetime view is a read concern (`checkUsageLimit` sums every month).
 * PDF import passes the page count here, not 1.
 */
export async function incrementUsage(
  userId: string,
  featureType: FeatureType,
  amount = 1,
): Promise<void> {
  const month = getMonthStart();
  await db.usageRecord.upsert({
    where: {
      userId_featureType_month: { userId, featureType, month },
    },
    create: { userId, featureType, month, count: amount },
    update: { count: { increment: amount } },
  });
}

export async function getUserUsageSummary(userId: string) {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { tier: true },
  });
  const tier = user.tier as TierKey;
  const limits = TIERS[tier].limits;

  const monthRecords = await db.usageRecord.findMany({
    where: { userId, month: getMonthStart() },
  });

  return Promise.all(
    (Object.entries(limits) as [FeatureType, number][]).map(async ([feature, limit]) => {
      let used: number;
      if (isLifetimeLimit(tier, feature)) {
        // Lifetime allowance — sum every month, not just the current one.
        const agg = await db.usageRecord.aggregate({
          where: { userId, featureType: feature },
          _sum: { count: true },
        });
        used = agg._sum.count ?? 0;
      } else {
        used = monthRecords.find((r) => r.featureType === feature)?.count ?? 0;
      }
      return { featureType: feature, used, limit };
    }),
  );
}
