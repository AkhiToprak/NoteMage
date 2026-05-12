// Phase 10.3 — shared shape + serializer used by GET endpoints that
// return a path tree. Keeps the include shape in one place so the list
// endpoint (`/api/learn/paths`), the detail endpoint
// (`/api/learn/paths/[planId]`), and the SSE `done` event all emit the
// same DTO.

import { Prisma } from '@prisma/client';
import { db } from './db';
import { annotatePhases } from './path-gating';

/**
 * The Prisma include shape every GET endpoint uses. Exported as a typed
 * constant so callers stay aligned even as the tree grows.
 */
export const pathInclude = {
  notebook: { select: { id: true, name: true, color: true, kind: true } },
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
 * Fetch every path the user owns, ordered by most-recently updated.
 */
export async function loadPathsForUser(userId: string): Promise<PlanWithTree[]> {
  return db.studyPlan.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
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
  prerequisiteSlotIds: string[];
  unlocked: boolean;
  completed: boolean;
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
  generationStatus: string;
  generationError: string | null;
  phases: SerializedPathPhase[];
}

/**
 * Annotate + flatten a Prisma plan into the DTO clients consume. Runs
 * `annotatePhases` from `path-gating.ts` so per-slot `unlocked` /
 * `completed` / `isActive` flags ship pre-computed.
 */
export function serializePath(plan: PlanWithTree): SerializedPath {
  const annotated = annotatePhases(plan.phases);
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
    generationStatus: plan.generationStatus,
    generationError: plan.generationError ?? null,
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
        prerequisiteSlotIds: s.prerequisiteSlotIds,
        unlocked: s.unlocked,
        completed: s.completed,
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
