import { db } from '@/lib/db';
import { TIERS, getMonthStart } from '@/lib/tiers';
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

  const tierConfig = TIERS[user.tier as TierKey];
  const limit = tierConfig.limits[featureType];

  // Unlimited
  if (limit === -1) {
    return { allowed: true, used: 0, limit: -1 };
  }

  const month = getMonthStart();
  const record = await db.usageRecord.findUnique({
    where: {
      userId_featureType_month: { userId, featureType, month },
    },
  });

  const used = record?.count ?? 0;
  return { allowed: used < limit, used, limit };
}

export async function incrementUsage(userId: string, featureType: FeatureType): Promise<void> {
  const month = getMonthStart();
  await db.usageRecord.upsert({
    where: {
      userId_featureType_month: { userId, featureType, month },
    },
    create: { userId, featureType, month, count: 1 },
    update: { count: { increment: 1 } },
  });
}

export async function getUserUsageSummary(userId: string) {
  const month = getMonthStart();
  const records = await db.usageRecord.findMany({
    where: { userId, month },
  });

  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { tier: true },
  });

  const tierConfig = TIERS[user.tier as TierKey];

  return Object.entries(tierConfig.limits).map(([feature, limit]) => {
    const record = records.find((r) => r.featureType === feature);
    return {
      featureType: feature as FeatureType,
      used: record?.count ?? 0,
      limit,
    };
  });
}
