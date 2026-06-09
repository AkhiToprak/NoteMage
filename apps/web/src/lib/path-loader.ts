// Phase 10.3 — shared shape + serializer used by GET endpoints that
// return a path tree. Keeps the include shape in one place so the list
// endpoint (`/api/learn/paths`), the detail endpoint
// (`/api/learn/paths/[planId]`), and the SSE `done` event all emit the
// same DTO.

import { Prisma } from '@prisma/client';
import type { SharedPathModerationStatus } from '@notemage/shared';
import { db } from './db';
import { annotatePhases } from './path-gating';

/**
 * Liveness window for a `generationStatus: 'generating'` path. The generation
 * and translation orchestrators bump `StudyPlan.updatedAt` on every progress
 * write (per slot / activity), so a `generating` row with no write for longer
 * than this has a DEAD orchestrator — e.g. the detached `generatePath` was
 * killed by a redeploy mid-run. Such a row is safe to reclaim; without this it
 * sticks in `generating` forever and regenerate/reset/delete all refuse it,
 * permanently bricking the path with no in-app recourse.
 */
export const STALE_GENERATION_MS = 15 * 60 * 1000;

/**
 * Timestamp boundary for {@link STALE_GENERATION_MS}: a `generating` row whose
 * `updatedAt` is older than this counts as a dead orchestrator and is
 * reclaimable. `updatedAt < cutoff` ⇒ stale; `updatedAt >= cutoff` ⇒ live.
 */
export function staleGenerationCutoff(): Date {
  return new Date(Date.now() - STALE_GENERATION_MS);
}

/**
 * The Prisma include shape every GET endpoint uses. Exported as a typed
 * constant so callers stay aligned even as the tree grows.
 */
export const pathInclude = {
  notebook: { select: { id: true, name: true, color: true, kind: true } },
  // Path-publishing P2 — the StudyPlan ↔ SharedPath relation is 1..0/1 via
  // SharedPath.@@unique([planId]). Including it lets the list endpoint
  // render the publication-status chip without a per-card round-trip; the
  // serializer collapses the array to a single nullable field.
  sharedPaths: {
    select: {
      id: true,
      moderationStatus: true,
      rejectionReason: true,
      approvedAt: true,
      createdAt: true,
    },
  },
  phases: {
    orderBy: { sortOrder: 'asc' },
    include: {
      slots: {
        orderBy: { sortOrder: 'asc' },
        include: {
          activities: { orderBy: { sortOrder: 'asc' } },
        },
      },
    },
  },
} satisfies Prisma.StudyPlanInclude;

type PlanWithTree = Prisma.StudyPlanGetPayload<{ include: typeof pathInclude }>;

/**
 * Fetch one of the user's paths with the full slot/activity tree.
 * Returns null when the plan doesn't exist or doesn't belong to the user.
 */
export async function loadPathForUser(
  userId: string,
  planId: string,
): Promise<PlanWithTree | null> {
  return db.studyPlan.findFirst({
    where: { id: planId, userId },
    include: pathInclude,
  });
}

/**
 * Fetch the user's paths (most-recently updated first) with the full
 * phase/slot/activity tree. Capped at 200 as a defensive bound so a user with
 * an unbounded path count can't pull an arbitrarily large tree in one request;
 * the most-recent ordering keeps the relevant rows in range.
 */
export async function loadPathsForUser(userId: string): Promise<PlanWithTree[]> {
  return db.studyPlan.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    take: 200,
    include: pathInclude,
  });
}

/**
 * DTO shape returned to clients. Centralized so the list / detail / SSE
 * `done` event all stay in lockstep.
 */
export interface SerializedPathActivity {
  id: string;
  kind: string;
  title: string;
  sortOrder: number;
  completed: boolean;
  theoryId: string | null;
  flashcardSetId: string | null;
  quizSetId: string | null;
}

export interface SerializedPathSlot {
  id: string;
  title: string;
  description: string | null;
  kind: string;
  sortOrder: number;
  starsEarned: number;
  bestPercentage: number | null;
  prerequisiteSlotIds: string[];
  unlocked: boolean;
  completed: boolean;
  /** Missing one or more expected activities — AI generation failed. */
  incompleteGeneration: boolean;
  /** Activity kinds Stage B intentionally pruned (material too thin). NOT a
   *  failure — the UI renders these as intentionally absent, not broken. */
  prunedActivityKinds: string[];
  isActive: boolean;
  activities: SerializedPathActivity[];
}

export interface SerializedPathPhase {
  id: string;
  title: string;
  description: string | null;
  sortOrder: number;
  status: string;
  gateStrategy: string;
  unlocked: boolean;
  unlockReason?: string;
  slots: SerializedPathSlot[];
}

/**
 * Slim publication summary attached to every serialized path. Populated
 * when the path has been submitted to the community library; null for
 * unpublished paths. Drives the status chip on the path card and the
 * Publish / Unpublish menu items without a per-card fetch.
 */
export interface SerializedPathPublication {
  shareId: string;
  moderationStatus: SharedPathModerationStatus;
  rejectionReason: string | null;
  approvedAt: string | null; // ISO-8601
  createdAt: string; // ISO-8601
}

export interface SerializedPath {
  id: string;
  title: string;
  description: string | null;
  notebookId: string | null;
  notebookTitle: string | null;
  notebookColor: string | null;
  notebookKind: string | null;
  contextNotebookIds: string[];
  startDate: Date;
  endDate: Date;
  source: string;
  /** Ultra (Pro-tier) path — drives the gold accent + badge on the Learn hub. */
  ultra: boolean;
  /** Content language the path is currently in (BCP-47 lowercase). */
  language: string;
  generationStatus: string;
  generationError: string | null;
  /**
   * Last write to the row (ISO-8601). The generation/translation
   * orchestrators bump this on every progress write, so the client can
   * detect a wedged `generating` path (no heartbeat for longer than
   * {@link STALE_GENERATION_MS}) and offer an in-app "stop" affordance.
   */
  updatedAt: string;
  /**
   * What the background run (if any) is doing — `"translate"` while an
   * in-place translation is in flight, otherwise null. Lets the card show a
   * "Translating…" state instead of "Generating…" so a translation isn't
   * mistaken for a content regeneration.
   */
  generationMode: string | null;
  /** Classifier-detected subject buckets, sorted by weight. Empty for legacy rows. */
  subjects: string[];
  /** Per-subject weights aligned with `subjects`. Empty for legacy rows. */
  subjectWeights: number[];
  /**
   * Publication-status companion (Phase 2 of the path-publishing plan).
   * Null when the path has never been published; otherwise carries the
   * current moderation status so the list view can render the chip
   * without an extra fetch per card.
   */
  publication: SerializedPathPublication | null;
  phases: SerializedPathPhase[];
}

/**
 * Annotate + flatten a Prisma plan into the DTO clients consume. Runs
 * `annotatePhases` from `path-gating.ts` so per-slot `unlocked` /
 * `completed` / `isActive` flags ship pre-computed.
 */
export function serializePath(plan: PlanWithTree): SerializedPath {
  const annotated = annotatePhases(plan.phases);
  // Collapse the 0..1 SharedPath array down to a single optional field.
  // @@unique([planId]) guarantees at most one row; we still defensively
  // pick the first in case Prisma returns an undefined ordering.
  const sp = plan.sharedPaths.length > 0 ? plan.sharedPaths[0] : null;
  const publication: SerializedPathPublication | null = sp
    ? {
        shareId: sp.id,
        moderationStatus: sp.moderationStatus as SharedPathModerationStatus,
        rejectionReason: sp.rejectionReason,
        approvedAt: sp.approvedAt ? sp.approvedAt.toISOString() : null,
        createdAt: sp.createdAt.toISOString(),
      }
    : null;
  // Surface the background run's mode (if any) so the UI can distinguish a
  // translation from a generation. Stored on generationProgress.mode by the
  // translator; absent for ordinary generation.
  const gp = plan.generationProgress;
  const generationMode =
    gp && typeof gp === 'object' && !Array.isArray(gp) &&
    typeof (gp as Record<string, unknown>).mode === 'string'
      ? ((gp as Record<string, unknown>).mode as string)
      : null;
  return {
    id: plan.id,
    title: plan.title,
    description: plan.description,
    notebookId: plan.notebookId,
    notebookTitle: plan.notebook?.name ?? null,
    notebookColor: plan.notebook?.color ?? null,
    notebookKind: plan.notebook?.kind ?? null,
    contextNotebookIds: plan.contextNotebookIds,
    startDate: plan.startDate,
    endDate: plan.endDate,
    source: plan.source,
    ultra: plan.ultra,
    language: plan.language,
    generationStatus: plan.generationStatus,
    generationError: plan.generationError ?? null,
    updatedAt: plan.updatedAt.toISOString(),
    generationMode,
    subjects: plan.subjects,
    subjectWeights: plan.subjectWeights,
    publication,
    phases: annotated.map((ap) => ({
      id: ap.source.id,
      title: ap.source.title,
      description: ap.source.description,
      sortOrder: ap.source.sortOrder,
      status: ap.source.status,
      gateStrategy: ap.source.gateStrategy,
      unlocked: ap.unlocked,
      unlockReason: ap.unlockReason,
      slots: ap.slots.map((s) => ({
        id: s.id,
        title: s.title,
        description: s.description,
        kind: s.kind,
        sortOrder: s.sortOrder,
        starsEarned: s.starsEarned,
        bestPercentage: s.bestPercentage,
        prerequisiteSlotIds: s.prerequisiteSlotIds,
        unlocked: s.unlocked,
        completed: s.completed,
        incompleteGeneration: s.incompleteGeneration,
        prunedActivityKinds: s.prunedActivityKinds,
        isActive: s.isActive,
        activities: s.activities.map((a) => ({
          id: a.id,
          kind: a.kind,
          title: a.title,
          sortOrder: a.sortOrder,
          completed: a.completed,
          theoryId: a.theoryId,
          flashcardSetId: a.flashcardSetId,
          quizSetId: a.quizSetId,
        })),
      })),
    })),
  };
}
