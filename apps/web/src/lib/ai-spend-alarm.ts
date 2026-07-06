import * as Sentry from '@sentry/nextjs';
import { db } from '@/lib/db';

/** Rolling AI spend watchdog, piggybacked on the hourly reminders.sweep chain.
 *  Fires a Sentry warning (and a worker-log line) when the last hour — or, once
 *  per UTC day, the last 24h — of computed costUsd crosses a threshold. This is
 *  a smoke alarm, not billing: costUsd is the same per-model estimate the admin
 *  stats page shows, not the provider invoice. */

const HOUR_MS = 60 * 60 * 1000;
const DAILY_CHECK_UTC_HOUR = 6;

function threshold(envKey: string, fallback: number): number {
  const parsed = parseFloat(process.env[envKey] ?? '');
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function windowSpendUsd(since: Date): Promise<number> {
  const agg = await db.aiUsageEvent.aggregate({
    where: { createdAt: { gte: since } },
    _sum: { costUsd: true },
  });
  return agg._sum.costUsd ?? 0;
}

async function topFeaturesByCost(since: Date): Promise<Array<{ feature: string; costUsd: number }>> {
  const rows = await db.aiUsageEvent.groupBy({
    by: ['feature'],
    where: { createdAt: { gte: since } },
    _sum: { costUsd: true },
    orderBy: { _sum: { costUsd: 'desc' } },
    take: 3,
  });
  return rows.map((r) => ({ feature: r.feature, costUsd: r._sum.costUsd ?? 0 }));
}

async function fireAlarm(label: 'hourly' | 'daily', windowUsd: number, thresholdUsd: number, since: Date) {
  const topFeatures = await topFeaturesByCost(since);
  console.warn(
    `[ai-spend-alarm] ${label} $${windowUsd.toFixed(2)} > $${thresholdUsd.toFixed(2)} · top: ${
      topFeatures.map((f) => `${f.feature} $${f.costUsd.toFixed(2)}`).join(', ') || 'none'
    }`,
  );
  Sentry.captureMessage(`ai-spend-alarm: ${label}`, {
    level: 'warning',
    extra: { windowUsd, thresholdUsd, topFeatures },
  });
}

/** Best-effort — never throws so a failing spend query can't break the sweep. */
export async function checkAiSpendAlarm(now: Date = new Date()): Promise<void> {
  try {
    const hourlyThreshold = threshold('AI_SPEND_ALARM_HOURLY_USD', 5);
    const hourlySince = new Date(now.getTime() - HOUR_MS);
    const hourlyUsd = await windowSpendUsd(hourlySince);
    if (hourlyUsd > hourlyThreshold) {
      await fireAlarm('hourly', hourlyUsd, hourlyThreshold, hourlySince);
    }

    // Daily check runs once per UTC day on the hourly cadence.
    if (now.getUTCHours() === DAILY_CHECK_UTC_HOUR) {
      const dailyThreshold = threshold('AI_SPEND_ALARM_DAILY_USD', 50);
      const dailySince = new Date(now.getTime() - 24 * HOUR_MS);
      const dailyUsd = await windowSpendUsd(dailySince);
      if (dailyUsd > dailyThreshold) {
        await fireAlarm('daily', dailyUsd, dailyThreshold, dailySince);
      }
    }
  } catch (err) {
    console.error('[ai-spend-alarm] check failed', err);
  }
}
