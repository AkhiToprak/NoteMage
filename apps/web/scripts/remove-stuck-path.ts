/**
 * One-off recovery: list / remove study paths wedged in
 * generationStatus='generating'.
 *
 * A path stuck mid-generation has NO in-app escape hatch: the DELETE, reset,
 * and regenerate endpoints all refuse when generationStatus === 'generating'
 * (they guard against racing the background orchestrator). If the orchestrator
 * died, the row stays "generating" / "Building…" forever. This script is the
 * manual recovery.
 *
 * Read-only by default. Connects to whatever DATABASE_URL points at — the
 * banner prints the host so you can confirm it's the right DB before --apply.
 *
 *   npx tsx scripts/remove-stuck-path.ts                       # list every stuck path
 *   npx tsx scripts/remove-stuck-path.ts --id=<planId>         # preview removal of one (read-only)
 *   npx tsx scripts/remove-stuck-path.ts --id=<planId> --apply # DELETE it + its generated content
 *   npx tsx scripts/remove-stuck-path.ts --id=<planId> --mode=fail --apply  # instead: flip to 'failed' (keeps the path, lets you Retry/Delete in the UI)
 */

import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();
const APPLY = process.argv.includes('--apply');
const MODE = (process.argv.find((a) => a.startsWith('--mode='))?.slice('--mode='.length) ?? 'delete') as
  | 'delete'
  | 'fail';
const ID = process.argv.find((a) => a.startsWith('--id='))?.slice('--id='.length);

function dbHost(): string {
  try {
    return new URL(process.env.DATABASE_URL ?? '').host || '(unknown)';
  } catch {
    return '(unparseable DATABASE_URL)';
  }
}

function ageDays(d: Date): string {
  const ms = Date.now() - d.getTime();
  return (ms / 86_400_000).toFixed(1) + 'd';
}

async function listStuck() {
  const stuck = await db.studyPlan.findMany({
    where: { generationStatus: 'generating' },
    select: {
      id: true,
      title: true,
      createdAt: true,
      updatedAt: true,
      generationError: true,
      generationProgress: true,
      user: { select: { email: true } },
    },
    orderBy: { updatedAt: 'asc' },
  });

  console.log(`\nPaths stuck in generationStatus='generating': ${stuck.length}\n`);
  for (const p of stuck) {
    console.log(
      `  ${p.id}  "${p.title}"\n` +
        `     owner=${p.user?.email ?? '?'}  created=${ageDays(p.createdAt)} ago  lastUpdate=${ageDays(p.updatedAt)} ago\n` +
        `     progress=${JSON.stringify(p.generationProgress)}  error=${p.generationError ?? 'none'}`
    );
  }
  return stuck;
}

async function previewOrRemove(planId: string) {
  // Mirror the app's DELETE handler exactly: gather the generated content ids
  // (theory / quiz / flashcard sets) that don't FK-cascade off the plan, so we
  // remove them in the same transaction and leave no orphans.
  const plan = await db.studyPlan.findUnique({
    where: { id: planId },
    select: {
      id: true,
      title: true,
      generationStatus: true,
      user: { select: { email: true } },
      phases: {
        select: {
          slots: {
            select: {
              activities: { select: { theoryId: true, flashcardSetId: true, quizSetId: true } },
            },
          },
        },
      },
    },
  });

  if (!plan) {
    console.error(`\n✗ No StudyPlan with id=${planId}\n`);
    process.exitCode = 1;
    return;
  }

  const theoryIds: string[] = [];
  const quizSetIds: string[] = [];
  const flashcardSetIds: string[] = [];
  for (const phase of plan.phases) {
    for (const slot of phase.slots) {
      for (const a of slot.activities) {
        if (a.theoryId) theoryIds.push(a.theoryId);
        if (a.quizSetId) quizSetIds.push(a.quizSetId);
        if (a.flashcardSetId) flashcardSetIds.push(a.flashcardSetId);
      }
    }
  }

  console.log(
    `\nTarget: ${plan.id}  "${plan.title}"  owner=${plan.user?.email ?? '?'}  status=${plan.generationStatus}`
  );

  if (MODE === 'fail') {
    console.log(`Mode: flip generationStatus 'generating' -> 'failed' (path + content preserved).`);
    if (!APPLY) {
      console.log(`\n(dry run — re-run with --apply to write)\n`);
      return;
    }
    await db.studyPlan.update({
      where: { id: planId },
      data: {
        generationStatus: 'failed',
        generationError: 'Generation was interrupted and manually marked failed for recovery.',
      },
    });
    console.log(`\n✓ Flipped to 'failed'. You can now Retry or Delete it from the UI.\n`);
    return;
  }

  console.log(
    `Mode: DELETE path + cascade (phases/slots/activities) + ${theoryIds.length} theory, ` +
      `${quizSetIds.length} quiz sets, ${flashcardSetIds.length} flashcard sets.`
  );
  if (!APPLY) {
    console.log(`\n(dry run — re-run with --apply to write)\n`);
    return;
  }

  await db.$transaction([
    db.studyPlan.delete({ where: { id: planId } }),
    db.theoryContent.deleteMany({ where: { id: { in: theoryIds } } }),
    db.quizSet.deleteMany({ where: { id: { in: quizSetIds } } }),
    db.flashcardSet.deleteMany({ where: { id: { in: flashcardSetIds } } }),
  ]);
  console.log(`\n✓ Deleted path ${planId} and its generated content.\n`);
}

async function main() {
  console.log(`DB host: ${dbHost()}   ${APPLY ? '*** --apply (WILL WRITE) ***' : '(read-only)'}`);
  if (ID) {
    await previewOrRemove(ID);
  } else {
    await listStuck();
    console.log(`\nNext: npx tsx scripts/remove-stuck-path.ts --id=<planId>   (preview a removal)\n`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
