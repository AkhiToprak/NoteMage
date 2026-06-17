// Materialize a guided-tutorial sample subject into the user's account: a real
// Notebook (the "study pack" container) + a real StudyPlan (source='sample',
// generationStatus='ready'), built from an in-code fixture via the shared
// deep-copy engine. Pure DB, zero AI cost. Idempotent per (user, sampleId).

import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { buildPhasesCreate, CLONE_TX_TIMEOUT_MS, PLAN_HORIZON_MS } from '@/lib/path-clone';
import { SAMPLE_CATALOG, type SampleId } from './catalog';
import { SAMPLE_FIXTURES } from './fixtures';

export interface MaterializeResult {
  planId: string;
  notebookId: string | null;
  /** First learning slot + its first activity — used to deep-link the handoff. */
  firstSlotId: string | null;
  firstActivityId: string | null;
  alreadyMaterialized: boolean;
}

/** Idempotency marker stored in StudyPlan.materialIds (a free String[], no FK —
 *  clonedFromSharedPathId can't be used, it's an enforced FK to SharedPath). */
function sampleMarker(id: SampleId): string {
  return `sample:${id}`;
}

const FIRST_SLOT_SELECT = {
  phases: {
    orderBy: { sortOrder: 'asc' as const },
    take: 1,
    select: {
      slots: {
        orderBy: { sortOrder: 'asc' as const },
        take: 1,
        select: {
          id: true,
          activities: {
            orderBy: { sortOrder: 'asc' as const },
            take: 1,
            select: { id: true },
          },
        },
      },
    },
  },
};

type FirstSlotShape = {
  phases: Array<{ slots: Array<{ id: string; activities: Array<{ id: string }> }> }>;
};

function pickFirst(plan: FirstSlotShape): { firstSlotId: string | null; firstActivityId: string | null } {
  const slot = plan.phases[0]?.slots[0] ?? null;
  return {
    firstSlotId: slot?.id ?? null,
    firstActivityId: slot?.activities[0]?.id ?? null,
  };
}

export async function materializeSamplePath(
  userId: string,
  sampleId: SampleId,
): Promise<MaterializeResult> {
  const meta = SAMPLE_CATALOG[sampleId];
  const fixture = SAMPLE_FIXTURES[sampleId];
  const marker = sampleMarker(sampleId);

  // Idempotency — one sample plan per (user, sampleId).
  const existing = await db.studyPlan.findFirst({
    where: { userId, source: 'sample', materialIds: { has: marker } },
    select: { id: true, notebookId: true, ...FIRST_SLOT_SELECT },
  });
  if (existing) {
    return {
      planId: existing.id,
      notebookId: existing.notebookId,
      ...pickFirst(existing),
      alreadyMaterialized: true,
    };
  }

  const now = new Date();
  const endDate = new Date(now.getTime() + PLAN_HORIZON_MS);

  const result = await db.$transaction(
    async (tx) => {
      // Notebook (study-pack container) + one source-material page.
      const notebook = await tx.notebook.create({
        data: {
          userId,
          name: meta.notebookName,
          subject: meta.subject,
          color: meta.color,
          kind: 'standard',
          sections: {
            create: {
              title: 'Sample material',
              sortOrder: 0,
              pages: {
                create: {
                  title: fixture.page.title,
                  pageType: 'text',
                  sortOrder: 0,
                  content: fixture.page.body as Prisma.InputJsonValue,
                },
              },
            },
          },
        },
        select: { id: true },
      });

      const plan = await tx.studyPlan.create({
        data: {
          userId,
          notebookId: notebook.id,
          title: fixture.plan.title,
          description: fixture.plan.description,
          startDate: now,
          endDate,
          source: 'sample',
          materialIds: [marker],
          generationStatus: 'ready',
          generationProgress: Prisma.JsonNull,
          language: fixture.plan.language,
          subjects: fixture.plan.subjects,
          subjectWeights: fixture.plan.subjects.map(() => 1),
          phases: {
            create: buildPhasesCreate(fixture.plan.phases, userId, false, now, endDate),
          },
        },
        select: { id: true, ...FIRST_SLOT_SELECT },
      });

      // Stamp notebookId + sourcePathId onto the plan's sets (mirrors first-party
      // path generation): the checkpoint quiz routes attempts by notebookId, and
      // sourcePathId keeps the bundles out of notebook surfaces.
      const acts = await tx.checkpointActivity.findMany({
        where: { slot: { phase: { planId: plan.id } } },
        select: { flashcardSetId: true, quizSetId: true },
      });
      const fcIds = acts.map((a) => a.flashcardSetId).filter((x): x is string => !!x);
      const qzIds = acts.map((a) => a.quizSetId).filter((x): x is string => !!x);
      if (fcIds.length) {
        await tx.flashcardSet.updateMany({
          where: { id: { in: fcIds } },
          data: { notebookId: notebook.id, sourcePathId: plan.id },
        });
      }
      if (qzIds.length) {
        await tx.quizSet.updateMany({
          where: { id: { in: qzIds } },
          data: { notebookId: notebook.id, sourcePathId: plan.id },
        });
      }

      return { planId: plan.id, notebookId: notebook.id, ...pickFirst(plan) };
    },
    { timeout: CLONE_TX_TIMEOUT_MS },
  );

  return { ...result, alreadyMaterialized: false };
}
