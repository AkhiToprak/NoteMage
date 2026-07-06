/**
 * Verifies the trigger-maintained path-completion denormalization (migration
 * 20260717000000) stays EXACTLY equal to the old nested-every anti-join
 * computation, across inserts, completions, un-completions, slot/phase adds and
 * deletes, and the flashcard-repetitions sum.
 *
 * Runs a mutation sequence and, after every step, asserts:
 *   - the set of "done" slots/phases/plans from the denorm columns ==
 *     the set from the original anti-join queries, and
 *   - users.flashcardRepetitionsSum == SUM(flashcards.repetitions).
 *
 * DESTRUCTIVE: creates and deletes its own test rows. Guarded — set
 * NM_ALLOW_DESTRUCTIVE=1 and point DATABASE_URL at a throwaway DB.
 *
 *   NM_ALLOW_DESTRUCTIVE=1 DATABASE_URL=... pnpm tsx scripts/db/verify-completion-denorm.ts
 */
import { PrismaClient } from '@prisma/client';

if (process.env.NM_ALLOW_DESTRUCTIVE !== '1') {
  console.error('Refusing to run: set NM_ALLOW_DESTRUCTIVE=1 and use a throwaway DATABASE_URL.');
  process.exit(1);
}

const db = new PrismaClient();
let failures = 0;

function assert(cond: boolean, msg: string) {
  if (!cond) {
    failures++;
    console.error(`  ✗ ASSERT FAILED: ${msg}`);
  }
}
function setEq(a: string[], b: string[]): boolean {
  const A = new Set(a);
  const B = new Set(b);
  return A.size === B.size && [...A].every((x) => B.has(x));
}

async function check(userId: string, label: string) {
  // Ground truth = original anti-join queries; candidate = denorm columns.
  const [oldSlots, newSlots] = await Promise.all([
    db.checkpointSlot.findMany({
      where: { phase: { plan: { userId } }, activities: { some: {}, every: { completed: true } } },
      select: { id: true },
    }),
    db.checkpointSlot.findMany({
      where: { phase: { plan: { userId } }, allActivitiesDone: true },
      select: { id: true },
    }),
  ]);
  const [oldPhases, newPhases] = await Promise.all([
    db.studyPhase.findMany({
      where: {
        plan: { userId },
        slots: { some: {}, every: { activities: { some: {}, every: { completed: true } } } },
      },
      select: { id: true },
    }),
    db.studyPhase.findMany({ where: { plan: { userId }, allSlotsDone: true }, select: { id: true } }),
  ]);
  const [oldPlans, newPlans] = await Promise.all([
    db.studyPlan.findMany({
      where: {
        userId,
        phases: {
          some: {},
          every: { slots: { some: {}, every: { activities: { some: {}, every: { completed: true } } } } },
        },
      },
      select: { id: true },
    }),
    db.studyPlan.findMany({ where: { userId, allPhasesDone: true }, select: { id: true } }),
  ]);
  const agg = await db.flashcard.aggregate({ _sum: { repetitions: true }, where: { flashcardSet: { userId } } });
  const user = await db.user.findUnique({ where: { id: userId }, select: { flashcardRepetitionsSum: true } });

  assert(setEq(oldSlots.map((s) => s.id), newSlots.map((s) => s.id)), `${label}: slots done (truth ${oldSlots.length} vs denorm ${newSlots.length})`);
  assert(setEq(oldPhases.map((p) => p.id), newPhases.map((p) => p.id)), `${label}: phases done (truth ${oldPhases.length} vs denorm ${newPhases.length})`);
  assert(setEq(oldPlans.map((p) => p.id), newPlans.map((p) => p.id)), `${label}: plans done (truth ${oldPlans.length} vs denorm ${newPlans.length})`);
  assert((agg._sum.repetitions ?? 0) === (user?.flashcardRepetitionsSum ?? -1), `${label}: flashcard sum (truth ${agg._sum.repetitions ?? 0} vs denorm ${user?.flashcardRepetitionsSum})`);
  if (failures === 0) console.log(`  ✓ ${label} — slotsDone=${newSlots.length} phasesDone=${newPhases.length} plansDone=${newPlans.length} cardSum=${user?.flashcardRepetitionsSum}`);
}

async function complete(id: string, done: boolean) {
  await db.checkpointActivity.update({ where: { id }, data: { completed: done, completedAt: done ? new Date() : null } });
}

async function main() {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
  const email = `denorm-test-${suffix}@example.invalid`;
  const username = `denormtest_${suffix}`.slice(0, 30);

  const user = await db.user.create({ data: { email, username, name: 'Denorm Test' } });
  const uid = user.id;
  console.log(`Created test user ${uid}`);

  try {
    const now = new Date();
    // Plan A: Ph1{S1[a1,a2], S2[a3,a4]}, Ph2{S3[a5,a6], S4[empty]}
    const planA = await db.studyPlan.create({
      data: {
        userId: uid, title: 'Plan A', startDate: now, endDate: now,
        phases: {
          create: [
            {
              title: 'Ph1', sortOrder: 0, startDate: now, endDate: now,
              slots: {
                create: [
                  { title: 'S1', sortOrder: 0, activities: { create: [{ kind: 'theory', title: 'a1', sortOrder: 0 }, { kind: 'quiz', title: 'a2', sortOrder: 1 }] } },
                  { title: 'S2', sortOrder: 1, activities: { create: [{ kind: 'theory', title: 'a3', sortOrder: 0 }, { kind: 'quiz', title: 'a4', sortOrder: 1 }] } },
                ],
              },
            },
            {
              title: 'Ph2', sortOrder: 1, startDate: now, endDate: now,
              slots: {
                create: [
                  { title: 'S3', sortOrder: 0, activities: { create: [{ kind: 'theory', title: 'a5', sortOrder: 0 }, { kind: 'quiz', title: 'a6', sortOrder: 1 }] } },
                  { title: 'S4-empty', sortOrder: 1 },
                ],
              },
            },
          ],
        },
      },
      include: { phases: { include: { slots: { include: { activities: true } } } } },
    });

    const ph1 = planA.phases.find((p) => p.title === 'Ph1')!;
    const ph2 = planA.phases.find((p) => p.title === 'Ph2')!;
    const S1 = ph1.slots.find((s) => s.title === 'S1')!;
    const S2 = ph1.slots.find((s) => s.title === 'S2')!;
    const S3 = ph2.slots.find((s) => s.title === 'S3')!;
    const S4 = ph2.slots.find((s) => s.title === 'S4-empty')!;
    const [a1, a2] = S1.activities.sort((x, y) => x.sortOrder - y.sortOrder);
    const [a3, a4] = S2.activities.sort((x, y) => x.sortOrder - y.sortOrder);
    const [a5, a6] = S3.activities.sort((x, y) => x.sortOrder - y.sortOrder);

    await check(uid, '01 initial (all incomplete)');
    await complete(a1.id, true); await check(uid, '02 a1 done (S1 partial)');
    await complete(a2.id, true); await check(uid, '03 a2 done (S1 complete, Ph1 partial)');
    await complete(a3.id, true); await complete(a4.id, true); await check(uid, '04 S2 done → Ph1 done, plan blocked by empty S4');
    await complete(a5.id, true); await complete(a6.id, true); await check(uid, '05 S3 done, Ph2 blocked by empty S4');
    await complete(a2.id, false); await check(uid, '06 un-complete a2 → S1 + Ph1 revert');
    await complete(a2.id, true); await check(uid, '07 re-complete a2 → S1 + Ph1 done again');
    await db.checkpointSlot.delete({ where: { id: S4.id } }); await check(uid, '08 delete empty S4 → Ph2 done → Plan A done');
    const S5 = await db.checkpointSlot.create({ data: { phaseId: ph2.id, title: 'S5-empty', sortOrder: 2 } });
    await check(uid, '09 add empty S5 to Ph2 → Ph2 + Plan A revert');
    await db.checkpointSlot.delete({ where: { id: S5.id } }); await check(uid, '10 delete S5 → Ph2 + Plan A done again');
    await db.checkpointActivity.delete({ where: { id: a6.id } }); await check(uid, '11 delete a6 (S3 still all-done via a5)');
    await db.checkpointActivity.delete({ where: { id: a5.id } }); await check(uid, '12 delete a5 → S3 empty → Ph2 + Plan A revert');

    // Second plan, fully completable → pathCompleteCount should reach 2 once both done.
    const planB = await db.studyPlan.create({
      data: {
        userId: uid, title: 'Plan B', startDate: now, endDate: now,
        phases: { create: [{ title: 'PhB', sortOrder: 0, startDate: now, endDate: now, slots: { create: [{ title: 'SB', sortOrder: 0, activities: { create: [{ kind: 'theory', title: 'b1', sortOrder: 0 }] } }] } }] },
      },
      include: { phases: { include: { slots: { include: { activities: true } } } } },
    });
    const b1 = planB.phases[0].slots[0].activities[0];
    // re-complete a5/a6 territory: recreate an activity in S3 and complete, and finish plan B
    await db.checkpointActivity.create({ data: { slotId: S3.id, kind: 'theory', title: 'a5b', sortOrder: 0, completed: true } });
    await complete(b1.id, true);
    await check(uid, '13 Plan A re-done + Plan B done → 2 complete plans');
    const doneCount = await db.studyPlan.count({ where: { userId: uid, allPhasesDone: true } });
    assert(doneCount === 2, `13 pathCompleteCount should be 2, got ${doneCount}`);

    // ── Flashcards ──────────────────────────────────────────────────────────
    const fs = await db.flashcardSet.create({ data: { userId: uid, title: 'FS' } });
    const c1 = await db.flashcard.create({ data: { flashcardSetId: fs.id, question: 'q1', answer: 'a', repetitions: 3 } });
    const c2 = await db.flashcard.create({ data: { flashcardSetId: fs.id, question: 'q2', answer: 'a', repetitions: 0 } });
    await check(uid, '14 cards created (sum 3)');
    await db.flashcard.update({ where: { id: c2.id }, data: { repetitions: 5 } }); await check(uid, '15 c2 → 5 (sum 8)');
    await db.flashcard.update({ where: { id: c1.id }, data: { repetitions: 0 } }); await check(uid, '16 c1 reset → 0 (sum 5)');
    await db.flashcard.delete({ where: { id: c2.id } }); await check(uid, '17 delete c2 (sum 0)');
    await db.flashcard.create({ data: { flashcardSetId: fs.id, question: 'q3', answer: 'a', repetitions: 10 } });
    await check(uid, '18 c3 = 10 (sum 10)');

    // ── Reheal must be a no-op (denorm already correct) ──────────────────────
    await db.$executeRawUnsafe('SELECT nm_reheal_completion_denorm()');
    await check(uid, '19 after reheal (must be unchanged)');

    console.log(failures === 0 ? '\nALL CHECKS PASSED ✓' : `\n${failures} CHECK(S) FAILED ✗`);
  } finally {
    // Cascade-delete the whole test tree (exercises DELETE triggers at scale).
    await db.user.delete({ where: { id: uid } }).catch((e) => console.error('cleanup failed', e));
    console.log('Cleaned up test user');
    await db.$disconnect();
  }
  process.exit(failures === 0 ? 0 : 1);
}

main();
