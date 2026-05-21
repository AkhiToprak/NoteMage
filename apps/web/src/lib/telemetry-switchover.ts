/**
 * Phase 12 (path-publishing) free-tier switchover telemetry.
 *
 * Three metrics from P0 spec §5.3 measure whether pulling AI path
 * generation out of the free tier hurts activation / retention or unit
 * economics:
 *
 *   free_user.path_clone              — a FREE user cloned a library path
 *   free_user.path_generation_blocked — a FREE user hit the disabled gate
 *   free_user.ai_cost_attributed      — nightly per-FREE-user AI COGS roll-up
 *
 * Events go to both the structured stdout sink (Coolify captures it) and
 * PostHog when configured, mirroring the existing telemetry call sites
 * (`logTelemetry` + `captureServerEvent`). The first two fire inline off
 * request paths (fire-and-forget); the third is an aggregation a nightly
 * job calls.
 */
import { db } from '@/lib/db';
import { logTelemetry } from '@/lib/telemetry-server';
import { captureServerEvent } from '@/lib/analytics/posthog-server';

const EV_CLONE = 'free_user.path_clone';
const EV_BLOCKED = 'free_user.path_generation_blocked';
const EV_COST = 'free_user.ai_cost_attributed';

function emit(
  userId: string | null,
  event: string,
  props?: Record<string, unknown>,
): void {
  logTelemetry(userId, event, props);
  if (userId) {
    captureServerEvent({ distinctId: userId, event, properties: props });
  }
}

/**
 * Fire-and-forget breadcrumb that a FREE user cloned a community path.
 * Self-checks the cloner's tier (off the clone route's critical path) so
 * the event only fires for FREE users — PRO / admin clones are not part
 * of the switchover-funnel metric. Never throws.
 */
export async function trackFreeUserPathClone(
  userId: string,
  shareId: string,
): Promise<void> {
  try {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { tier: true },
    });
    if (user?.tier !== 'FREE') return;
    emit(userId, EV_CLONE, { shareId });
  } catch {
    /* telemetry must never break a clone */
  }
}

/**
 * A FREE user's AI path generation was blocked by the switchover gate.
 * The sole caller is the `POST /api/learn/paths` gate, which only reaches
 * this branch for a FREE user (admins / PRO are never blocked there), so
 * no tier re-check is needed. Synchronous + cheap; never throws.
 */
export function trackFreeUserPathGenerationBlocked(userId: string): void {
  try {
    emit(userId, EV_BLOCKED, { feature: 'ai_study_plan' });
  } catch {
    /* never throw out of telemetry */
  }
}

export interface FreeUserCostRollup {
  windowStart: string;
  windowEnd: string;
  /** Per-FREE-user moderation cost in the window (publisher-attributed). */
  moderationByUser: Array<{ userId: string; costUsd: number }>;
  /** Sum of all moderation cost attributed to FREE users. */
  moderationTotalUsd: number;
  /**
   * Window total of translation cost. PathTranslation rows are shared
   * across every viewer (the whole point of the cache), so translation
   * cost has no single attributable user — it's reported as a total, not
   * split per user. Per-cloner amortised share is bounded by the
   * popularity gate (≥10 cloners before a path is pre-translated — P0 §7.5).
   */
  translationTotalUsd: number;
  freeUserCount: number;
}

/**
 * Nightly per-FREE-user AI-cost roll-up (P0 spec §5.3 / AC-Switch-4).
 *
 * Two cost sources:
 *   - Moderation: `ModerationAudit.costUsd`, attributed to the path's
 *     publisher (`SharedPath.sharedById`) when that publisher is FREE.
 *     This is the residual AI cost a free user can still incur
 *     post-switchover (publishing a pre-flip path triggers L2 / L3).
 *   - Translation: `PathTranslation.costUsd`, reported as a window total
 *     (see `translationTotalUsd` above).
 *
 * Emits one `free_user.ai_cost_attributed` event per FREE user with
 * non-zero moderation cost, and returns the structured numbers so the
 * caller (a nightly script / cron) can assert against the AC-Economics
 * ceiling. Wiring it to a scheduler is a deploy-time concern; the
 * computation lives here so it's testable.
 */
export async function rollupFreeUserAiCost(opts: {
  since: Date;
  until?: Date;
}): Promise<FreeUserCostRollup> {
  const until = opts.until ?? new Date();
  const window = { gte: opts.since, lt: until };

  // Moderation audits in the window, with the path's publisher id. Two
  // steps (audits → distinct publishers → which are FREE) rather than a
  // nested tier include keeps the query resilient to relation renames.
  const audits = await db.moderationAudit.findMany({
    where: { createdAt: window, costUsd: { gt: 0 } },
    select: { costUsd: true, sharedPath: { select: { sharedById: true } } },
  });

  const publisherIds = [...new Set(audits.map((a) => a.sharedPath.sharedById))];
  const freeUsers = publisherIds.length
    ? await db.user.findMany({
        where: { id: { in: publisherIds }, tier: 'FREE' },
        select: { id: true },
      })
    : [];
  const freeSet = new Set(freeUsers.map((u) => u.id));

  const byUser = new Map<string, number>();
  for (const a of audits) {
    const uid = a.sharedPath.sharedById;
    if (!freeSet.has(uid)) continue;
    byUser.set(uid, (byUser.get(uid) ?? 0) + a.costUsd);
  }

  const translationAgg = await db.pathTranslation.aggregate({
    where: { createdAt: window },
    _sum: { costUsd: true },
  });

  const moderationByUser = [...byUser.entries()]
    .map(([userId, costUsd]) => ({ userId, costUsd }))
    .sort((a, b) => b.costUsd - a.costUsd);
  const moderationTotalUsd = moderationByUser.reduce((s, r) => s + r.costUsd, 0);
  const translationTotalUsd = translationAgg._sum.costUsd ?? 0;

  const rollup: FreeUserCostRollup = {
    windowStart: opts.since.toISOString(),
    windowEnd: until.toISOString(),
    moderationByUser,
    moderationTotalUsd,
    translationTotalUsd,
    freeUserCount: moderationByUser.length,
  };

  for (const row of moderationByUser) {
    emit(row.userId, EV_COST, {
      windowStart: rollup.windowStart,
      windowEnd: rollup.windowEnd,
      moderationCostUsd: row.costUsd,
    });
  }
  // Window summary breadcrumb (translation total has no per-user owner).
  emit(null, EV_COST, {
    scope: 'window_summary',
    windowStart: rollup.windowStart,
    windowEnd: rollup.windowEnd,
    moderationTotalUsd,
    translationTotalUsd,
    freeUserCount: rollup.freeUserCount,
  });

  return rollup;
}
