import { db } from '@/lib/db';
import { cacheDel, cacheGetOrSet } from '@/lib/redis-cache';
import { TIERS, getMonthStart, isLifetimeLimit } from '@/lib/tiers';
import type { FeatureType, TierKey } from '@/lib/tiers';

interface UsageLimitResult {
  allowed: boolean;
  used: number;
  limit: number; // -1 = unlimited
  /** True when this tier's budget for the feature is lifetime, not monthly. */
  lifetime: boolean;
}

const USER_USAGE_SUMMARY_CACHE_TTL_SECONDS = 20;

function userUsageSummaryCacheKey(userId: string): string {
  return `cache:user-usage-summary:${userId}`;
}

export async function invalidateUserUsageSummaryCache(userId: string): Promise<void> {
  await cacheDel(userUsageSummaryCacheKey(userId));
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
    return { allowed: true, used: 0, limit: -1, lifetime: false };
  }

  const tier = user.tier as TierKey;
  const limit = TIERS[tier].limits[featureType];

  // Unlimited
  if (limit === -1) {
    return { allowed: true, used: 0, limit: -1, lifetime: false };
  }

  const lifetime = isLifetimeLimit(tier, featureType);
  let used: number;
  if (lifetime) {
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

  return { allowed: used < limit, used, limit, lifetime };
}

/**
 * Atomically reserve `amount` (default 1) of a user's quota for a feature.
 *
 * This is the race-free replacement for the `checkUsageLimit` → (do work) →
 * `incrementUsage` sequence. Done as two separate calls, that sequence has a
 * TOCTOU window: two concurrent requests can both read `used < limit` before
 * either increments, and both then proceed — overshooting the cap. `reserveUsage`
 * closes that window by performing the check AND the increment inside a single
 * transaction guarded by a per-(user,feature) advisory lock, so concurrent
 * reservations for the same user+feature serialize.
 *
 * Reserve-then-settle contract:
 *  - On `{ allowed: true }` the quota has ALREADY been charged. Callers MUST treat
 *    this as a committed reservation.
 *  - If the paid action subsequently FAILS (the AI call errors, the import yields
 *    nothing, etc.), the caller MUST call `refundUsage(userId, featureType, amount)`
 *    to release the reservation. `reserveUsage` never auto-refunds — it cannot know
 *    whether downstream work succeeded.
 *  - On `{ allowed: false }` nothing was charged; no refund is owed.
 *
 * Admins and unlimited (-1) tiers short-circuit to `{ allowed: true, used: 0,
 * limit: -1 }` WITHOUT touching the meter — matching `checkUsageLimit`.
 *
 * The advisory lock is transaction-scoped (`pg_advisory_xact_lock`) and releases
 * automatically when the transaction commits or rolls back.
 */
export async function reserveUsage(
  userId: string,
  featureType: FeatureType,
  amount = 1,
): Promise<UsageLimitResult> {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { tier: true, role: true },
  });

  // Admins have unlimited everything — never charge the meter.
  if (user.role === 'admin') {
    return { allowed: true, used: 0, limit: -1, lifetime: false };
  }

  const tier = user.tier as TierKey;
  const limit = TIERS[tier].limits[featureType];

  // Unlimited — never charge the meter.
  if (limit === -1) {
    return { allowed: true, used: 0, limit: -1, lifetime: false };
  }

  const lifetime = isLifetimeLimit(tier, featureType);

  const result = await db.$transaction(async (tx) => {
    // Serialize concurrent reservations for this exact (user, feature). The
    // tagged-template interpolation parameterizes the argument (safe from
    // injection); hashtext() returns int4, which casts to the bigint that
    // pg_advisory_xact_lock expects. Lock auto-releases at transaction end.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${userId}:${featureType}`}))`;

    let used: number;
    if (lifetime) {
      // Lifetime allowance — sum every month's usage; it never resets.
      const agg = await tx.usageRecord.aggregate({
        where: { userId, featureType },
        _sum: { count: true },
      });
      used = agg._sum.count ?? 0;
    } else {
      const record = await tx.usageRecord.findUnique({
        where: {
          userId_featureType_month: { userId, featureType, month: getMonthStart() },
        },
      });
      used = record?.count ?? 0;
    }

    // Would exceed the cap — reject without charging.
    if (used + amount > limit) {
      return { allowed: false, used, limit, lifetime };
    }

    // Commit the reservation by incrementing the current month's row.
    const month = getMonthStart();
    await tx.usageRecord.upsert({
      where: {
        userId_featureType_month: { userId, featureType, month },
      },
      create: { userId, featureType, month, count: amount },
      update: { count: { increment: amount } },
    });

    return { allowed: true, used: used + amount, limit, lifetime };
  });

  if (result.allowed) await invalidateUserUsageSummaryCache(userId);
  return result;
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
  await invalidateUserUsageSummaryCache(userId);
}

/**
 * Refund `amount` (default 1) of a user's CURRENT-month usage for a feature —
 * the reserve-and-settle counterpart to `incrementUsage`. Used when a paid
 * action charged up front (e.g. an ultra path) then fails to deliver anything.
 * Clamped at 0 so a refund can NEVER mint credit, and a no-op when there is no
 * record (or nothing left) to refund. See plans/path-generation-reliability.md.
 */
export async function refundUsage(
  userId: string,
  featureType: FeatureType,
  amount = 1,
): Promise<void> {
  const month = getMonthStart();
  const record = await db.usageRecord.findUnique({
    where: { userId_featureType_month: { userId, featureType, month } },
  });
  if (!record || record.count <= 0) return;
  await db.usageRecord.update({
    where: { userId_featureType_month: { userId, featureType, month } },
    data: { count: Math.max(0, record.count - amount) },
  });
  await invalidateUserUsageSummaryCache(userId);
}

export async function getUserUsageSummary(userId: string) {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { tier: true },
  });
  const tier = user.tier as TierKey;
  const limits = TIERS[tier].limits;

  // Two flat queries cover every feature: the current month's per-feature rows
  // (for monthly limits) and one grouped lifetime sum across all months (for
  // lifetime limits). Replaces the previous per-lifetime-feature aggregate.
  const [monthRecords, lifetimeSums] = await Promise.all([
    db.usageRecord.findMany({
      where: { userId, month: getMonthStart() },
    }),
    db.usageRecord.groupBy({
      by: ['featureType'],
      where: { userId },
      _sum: { count: true },
    }),
  ]);

  const lifetimeByFeature = new Map(
    lifetimeSums.map((g) => [g.featureType, g._sum.count ?? 0]),
  );

  return (Object.entries(limits) as [FeatureType, number][]).map(([feature, limit]) => {
    const lifetime = isLifetimeLimit(tier, feature);
    let used: number;
    if (lifetime) {
      // Lifetime allowance — sum every month, not just the current one.
      used = lifetimeByFeature.get(feature) ?? 0;
    } else {
      used = monthRecords.find((r) => r.featureType === feature)?.count ?? 0;
    }
    return { featureType: feature, used, limit, lifetime };
  });
}

export async function getCachedUserUsageSummary(userId: string) {
  return cacheGetOrSet(userUsageSummaryCacheKey(userId), USER_USAGE_SUMMARY_CACHE_TTL_SECONDS, () =>
    getUserUsageSummary(userId),
  );
}
