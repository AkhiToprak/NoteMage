import { db } from '@/lib/db';
import { cacheDel, cacheGetOrSet } from '@/lib/redis-cache';
import {
  CANCELLING_STATUS,
  loadPathsForUser,
  serializePath,
  type SerializedPath,
} from '@/lib/path-loader';
import { derivePathStats, findContinueSlot } from '@/lib/path-stats';
import type { PathPlan } from '@/components/learn/PathView';

const DASHBOARD_CACHE_TTL_SECONDS = 30;
const PATHS_CACHE_TTL_SECONDS = 30;

export interface DashboardData {
  hasUsablePath: boolean;
  studiedToday: boolean;
  active: DashboardActivePath | null;
}

export interface DashboardActivePath {
  id: string;
  title: string;
  sourceLabel: string;
  notebookTitle: string | null;
  subjects: string[];
  units: number;
  lessons: number;
  pathCount: number;
  stats: {
    progressPct: number;
    doneCheckpoints: number;
    totalCheckpoints: number;
    weakTopicName: string | null;
    weakTopicCount: number;
  };
  nextSlot: null | {
    id: string;
    title: string;
    kind: string;
    href: string;
    ctaLabel: string;
  };
  checkpoint: null | {
    title: string;
    lessonsUntil: number;
  };
  askTopic: string;
}

function dashboardCacheKey(userId: string): string {
  return `cache:dashboard:${userId}`;
}

function pathsCacheKey(userId: string): string {
  return `cache:paths:${userId}`;
}

/**
 * Invalidate the per-user path-derived caches: the dashboard summary AND the
 * serialized path-overview list ({@link loadSerializedPathsForUser}). Both are
 * computed from the same StudyPlan tree, so any path mutation
 * (create/delete/reset/translate/cancel/regenerate), slot/activity completion,
 * or generation/translation finishing must clear both. Every such call site
 * already invokes this, so the path-list cache stays exactly as fresh as the
 * dashboard cache it sits beside.
 */
export async function invalidateDashboardCache(userId: string): Promise<void> {
  await cacheDel(dashboardCacheKey(userId), pathsCacheKey(userId));
}

function sourceLabel(p: SerializedPath): string {
  if (p.notebookTitle) return `From ${p.notebookTitle}`;
  switch (p.source) {
    case 'sample':
      return 'From sample material';
    case 'import':
      return 'From your upload';
    default:
      return 'AI-generated path';
  }
}

function deriveNextCheckpoint(p: SerializedPath): { title: string; lessonsUntil: number } | null {
  let lessons = 0;
  for (const phase of p.phases) {
    for (const slot of phase.slots) {
      if (slot.completed) continue;
      const isAssessment = slot.kind === 'assessment' || slot.kind === 'final_exam';
      if (isAssessment) return { title: slot.title, lessonsUntil: lessons };
      lessons += 1;
    }
  }
  return null;
}

function lessonCount(p: SerializedPath): number {
  return p.phases.reduce(
    (n, ph) => n + ph.slots.reduce((m, s) => m + (s.activities?.length ?? 0), 0),
    0,
  );
}

export function deriveDashboardDataFromPaths(
  paths: SerializedPath[],
  studiedToday: boolean,
): DashboardData {
  // Studyable = settled paths with slots, PLUS generating paths that already
  // have a built checkpoint (so "continue" can resume them while Stage B runs).
  const ready = paths.filter((p) =>
    p.generationStatus !== 'generating'
      ? p.phases.some((ph) => ph.slots.length > 0)
      : p.phases.some((ph) => ph.slots.some((s) => (s.activities?.length ?? 0) > 0)),
  );
  const active =
    ready.find((p) => derivePathStats(p as unknown as PathPlan).progressPct < 100) ?? ready[0];

  if (!active) {
    return { hasUsablePath: false, studiedToday, active: null };
  }

  const stats = derivePathStats(active as unknown as PathPlan);
  const nextSlot = findContinueSlot(active as unknown as PathPlan);
  const isAssessment = nextSlot?.kind === 'assessment' || nextSlot?.kind === 'final_exam';

  return {
    hasUsablePath: true,
    studiedToday,
    active: {
      id: active.id,
      title: active.title,
      sourceLabel: sourceLabel(active),
      notebookTitle: active.notebookTitle,
      subjects: active.subjects,
      units: active.phases.length,
      lessons: lessonCount(active),
      pathCount: ready.length,
      stats: {
        progressPct: stats.progressPct,
        doneCheckpoints: stats.doneCheckpoints,
        totalCheckpoints: stats.totalCheckpoints,
        weakTopicName: stats.weakTopicName,
        weakTopicCount: stats.weakCheckpoints.length,
      },
      nextSlot: nextSlot
        ? {
            id: nextSlot.id,
            title: nextSlot.title,
            kind: nextSlot.kind,
            href: `/learn/paths/${encodeURIComponent(active.id)}?slot=${encodeURIComponent(nextSlot.id)}`,
            ctaLabel: isAssessment ? 'Take checkpoint' : 'Continue studying',
          }
        : null,
      checkpoint: deriveNextCheckpoint(active),
      askTopic: nextSlot?.title ?? active.title,
    },
  };
}

async function hasActivePathWork(userId: string): Promise<boolean> {
  const count = await db.studyPlan.count({
    where: {
      userId,
      generationStatus: { in: ['queued', 'generating', CANCELLING_STATUS] },
    },
  });
  return count > 0;
}

async function buildDashboardData(userId: string): Promise<DashboardData> {
  const todayUtcStart = new Date();
  todayUtcStart.setUTCHours(0, 0, 0, 0);

  const [plans, todayMinutesCount] = await Promise.all([
    loadPathsForUser(userId),
    db.studyMinute.count({
      where: { userId, minute: { gte: todayUtcStart } },
    }),
  ]);

  return deriveDashboardDataFromPaths(plans.map(serializePath), todayMinutesCount > 0);
}

export async function getDashboardData(userId: string): Promise<DashboardData> {
  if (await hasActivePathWork(userId)) {
    return buildDashboardData(userId);
  }

  return cacheGetOrSet(dashboardCacheKey(userId), DASHBOARD_CACHE_TTL_SECONDS, () =>
    buildDashboardData(userId),
  );
}

/**
 * The path-overview list (`/my-path` SSR + `GET /api/learn/paths`),
 * Redis-cached per user. Mirrors {@link getDashboardData}: while a path is in
 * flight (`queued`/`generating`/`cancelling`) the cache is bypassed so the
 * in-progress cards reflect live progress; otherwise the serialized tree is
 * served from cache for {@link PATHS_CACHE_TTL_SECONDS}. Invalidated by
 * {@link invalidateDashboardCache} on every path mutation + completion, so a
 * cache hit is never staler than the dashboard.
 *
 * This replaces the previous per-visit `loadPathsForUser().map(serializePath)`
 * that ran on every `force-dynamic` overview load — ~5 sequential round-trips
 * to the remote DB plus full gating serialization, with no caching.
 */
export async function loadSerializedPathsForUser(userId: string): Promise<SerializedPath[]> {
  if (await hasActivePathWork(userId)) {
    return (await loadPathsForUser(userId)).map(serializePath);
  }

  return cacheGetOrSet(pathsCacheKey(userId), PATHS_CACHE_TTL_SECONDS, async () =>
    (await loadPathsForUser(userId)).map(serializePath),
  );
}
