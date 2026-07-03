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
import { weaknessTrainingUiEnabled, flashcardReviewQueueEnabled } from '@/lib/feature-flags';
import { deriveConceptWeakAreas } from '@/lib/concept-weak-areas';
import { loadConceptWeakAreaRows } from '@/lib/concept-weak-areas-loader';
import { countDueFlashcards } from '@/lib/flashcard-review-queue';

const DASHBOARD_CACHE_TTL_SECONDS = 30;
const PATHS_CACHE_TTL_SECONDS = 30;

export interface DashboardData {
  hasUsablePath: boolean;
  studiedToday: boolean;
  active: DashboardActivePath | null;
  /**
   * Weakness Training Phase 2 (plan §6.1, §7.1) — canonical concept-level
   * weak-spot count for this user across ALL paths, from the SAME
   * `deriveConceptWeakAreas({ scope: 'all-paths' })` call the
   * `/profile/weak-spots` page uses, so the dashboard tile/rail count can
   * never disagree with that page's count. `null` when the Weakness Training
   * UI flag is off, or when the user has no `weak`/`rusty` concepts yet
   * (`coldStart !== 'weak_spots_found'`) — callers should fall back to the
   * pre-Phase-2 Mage-based behavior in either case.
   */
  conceptWeakSpots: { count: number; topLabel: string | null } | null;
  /**
   * Weakness Training Phase 4.3c (plan §13.7, §13.8) — cheap count-only due-
   * flashcard total (`countDueFlashcards`, NOT the full queue payload), same
   * where-clause as `loadReviewQueue` so this can never disagree with what
   * `/practice/review` itself would show. `null` when the review-queue flag
   * is off OR there are zero due cards — callers should hide the tile in
   * either case (mirrors `conceptWeakSpots`'s null convention).
   */
  dueFlashcards: { dueCount: number } | null;
  /**
   * Weakness Training Phase 4.4b (plan §14.4 rung 1, §14.8) — the in-app
   * escalation state for the weak-spots tile, read from the user's latest
   * unresolved `WeaknessNudgeLog` in-app row (state `nudged` or
   * `escalated`). `escalated: true` drives the tile's border-token swap to
   * the error token; `escalated: false` (state `nudged`) drives the amber
   * variant. `badgeCount` is that row's `conceptIds.length`, capped at 9 so
   * the badge never needs two digits. `null` when there is no unresolved
   * in-app row OR the weakness UI flag is off — callers render the tile's
   * pre-4.4b appearance in either case (purely additive).
   */
  nudgeState: { escalated: boolean; badgeCount: number } | null;
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
 * (create/delete/reset/cancel/regenerate), slot/activity completion,
 * or generation finishing must clear both. Every such call site
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
    return {
      hasUsablePath: false,
      studiedToday,
      active: null,
      conceptWeakSpots: null,
      dueFlashcards: null,
      nudgeState: null,
    };
  }

  const stats = derivePathStats(active as unknown as PathPlan);
  const nextSlot = findContinueSlot(active as unknown as PathPlan);
  const isAssessment = nextSlot?.kind === 'assessment' || nextSlot?.kind === 'final_exam';

  return {
    hasUsablePath: true,
    studiedToday,
    conceptWeakSpots: null,
    dueFlashcards: null,
    nudgeState: null,
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

  const data = deriveDashboardDataFromPaths(plans.map(serializePath), todayMinutesCount > 0);

  // Weakness Training Phase 2 (plan §6.1, §7.1) — same ConceptMastery read +
  // deriveConceptWeakAreas({ scope: 'all-paths' }) call as
  // `/profile/weak-spots` (see app/(dashboard)/profile/weak-spots/page.tsx),
  // so the dashboard tile/rail count can never disagree with that page.
  // Flag-gated and additive: only queried when the UI flag is on, and this
  // whole computation sits inside `buildDashboardData`, which is already
  // Redis-cached by `getDashboardData` (30s) — no extra uncached DB cost.
  let conceptWeakSpots: DashboardData['conceptWeakSpots'] = null;
  let nudgeState: DashboardData['nudgeState'] = null;
  if (weaknessTrainingUiEnabled()) {
    const concepts = await loadConceptWeakAreaRows(userId);

    const res = deriveConceptWeakAreas({ concepts, now: new Date(), scope: { scope: 'all-paths' } });
    if (res.coldStart === 'weak_spots_found') {
      conceptWeakSpots = { count: res.areas.length, topLabel: res.areas[0]?.label ?? null };
    }

    // Weakness Training Phase 4.4b (plan §14.4 rung 1, §14.8) — one cheap
    // indexed lookup (`@@index([userId, sentAt])`) for the latest unresolved
    // in-app nudge, alongside the weak-spots read above inside this same
    // Redis-cached `buildDashboardData` call. `resolveNudgesForUser` (4.4a,
    // called on weak-spots-page visit) is what clears this — this loader
    // only reads, never writes.
    const latestNudge = await db.weaknessNudgeLog.findFirst({
      where: { userId, channel: 'in_app', state: { in: ['nudged', 'escalated'] } },
      orderBy: { sentAt: 'desc' },
      select: { state: true, conceptIds: true },
    });
    if (latestNudge) {
      nudgeState = {
        escalated: latestNudge.state === 'escalated',
        badgeCount: Math.min(latestNudge.conceptIds.length, 9),
      };
    }
  }

  // Weakness Training Phase 4.3c (plan §13.7, §13.8) — cheap count query
  // (not the full queue) alongside the weak-spots block above; both sit
  // inside this same Redis-cached `buildDashboardData` call.
  let dueFlashcards: DashboardData['dueFlashcards'] = null;
  if (flashcardReviewQueueEnabled()) {
    const dueCount = await countDueFlashcards(userId, new Date());
    if (dueCount > 0) {
      dueFlashcards = { dueCount };
    }
  }

  return { ...data, conceptWeakSpots, dueFlashcards, nudgeState };
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
