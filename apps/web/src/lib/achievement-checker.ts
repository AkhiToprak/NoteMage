import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { ACHIEVEMENTS, UserStats } from './achievements';
import { unlockCosmeticsForAchievement } from './cosmetics/unlock';

/**
 * Threshold (in minutes) for the "locked in" achievement — same value the
 * heatmap uses for its "full color" tier. Hitting this many minutes in any
 * single day, ever, unlocks the badge.
 */
const DAILY_GOAL_MINUTES = 60;

/** All badge keys except the meta-achievement */
const NON_META_BADGES = ACHIEVEMENTS.filter((a) => a.badge !== 'all_achievements').map(
  (a) => a.badge
);

/** All valid badge keys (used to exclude orphaned old records from counts) */
const VALID_BADGES = ACHIEVEMENTS.map((a) => a.badge);

// These independent counts/lookups already run concurrently via Promise.all;
// the remaining queries hit distinct tables/shapes, so there is nothing safe to
// merge without changing results. Caching is out of scope (invalidation risk).
export async function gatherUserStats(userId: string): Promise<UserStats> {
  const [
    notebookCount,
    streak,
    friendCount,
    sharedNotebookCount,
    groupCount,
    allWrongAttempt,
    userRecord,
    examCount,
    folderCount,
    sharedStudyMaterialCount,
    canvasPageCount,
    totalTodos,
    incompleteTodos,
    unlockedCount,
  ] = await Promise.all([
    // Notebooks owned by user
    db.notebook.count({ where: { userId } }),

    // Current streak
    db.userStreak.findUnique({
      where: { userId },
      select: { currentStreak: true },
    }),

    // Friends (accepted friendships where user is either side)
    db.friendship.count({
      where: {
        status: 'accepted',
        OR: [{ requesterId: userId }, { addresseeId: userId }],
      },
    }),

    // Community publishes (shared notebooks with no specific recipient)
    db.sharedNotebook.count({
      where: { sharedById: userId, sharedWithId: null },
    }),

    // Study group memberships
    db.studyGroupMember.count({ where: { userId } }),

    // Any quiz attempt with all wrong answers
    db.quizAttempt.findFirst({
      where: { userId, score: 0, total: { gt: 0 } },
      select: { id: true },
    }),

    // User record for usernameChanged, scholarName, tutorial state, and
    // the Phase 7 in-session streak/comeback signals persisted by the
    // attempts route.
    db.user.findUnique({
      where: { id: userId },
      select: {
        usernameChanged: true,
        scholarName: true,
        tutorialState: true,
        maxQuizStreakEver: true,
        everHadComeback: true,
      },
    }),

    // Exam count
    db.exam.count({ where: { userId } }),

    // Folder count
    db.notebookFolder.count({ where: { userId } }),

    // Shared flashcard sets or quizzes in groups
    db.groupSharedContent.count({
      where: {
        sharedById: userId,
        contentType: { in: ['flashcard_set', 'quiz_set'] },
      },
    }),

    // Canvas pages in user's notebooks
    db.page.count({
      where: { pageType: 'canvas', section: { notebook: { userId } } },
    }),

    // Total todos
    db.todo.count({ where: { userId } }),

    // Incomplete todos
    db.todo.count({ where: { userId, completed: false } }),

    // Count of valid unlocked achievements (exclude orphaned old badges)
    db.achievement.count({
      where: { userId, badge: { in: VALID_BADGES } },
    }),
  ]);

  const [chatMessageCount, flashcardReviewAgg, documentCount, quizSetCount] = await Promise.all([
    db.chatMessage.count({ where: { userId, role: 'user' } }),

    // SR bumps Flashcard.repetitions; no per-review row exists, so sum.
    // Phase 9.6 — FlashcardSet has direct userId now; no notebook hop.
    db.flashcard.aggregate({
      _sum: { repetitions: true },
      where: { flashcardSet: { userId } },
    }),

    db.document.count({ where: { notebook: { userId } } }),

    // Phase 9.6 — QuizSet has direct userId now; no notebook hop.
    db.quizSet.count({ where: { userId } }),
  ]);

  // ── Phase 7 — personal learning-path rework gather ───────────────────────
  // Three of these go through Prisma (path/phase rollups), two through
  // raw SQL where Prisma's relational where-builder can't express the
  // condition cheaply (perfect-on-a-5+-question-quiz, first-attempt ace).
  // `maxQuizStreakEver` and `everHadComeback` are denormalized on User
  // and arrive via `userRecord` above — no extra query.
  const [
    perfectQuizRow,
    phaseComplete,
    pathCompleteCount,
    checkpointAceRow,
    sectionComplete,
  ] = await Promise.all([
    db.$queryRaw<{ ok: boolean }[]>(Prisma.sql`
      SELECT EXISTS (
        SELECT 1
        FROM quiz_attempts a
        JOIN quiz_sets s ON s.id = a."quizSetId"
        WHERE a."userId" = ${userId}
          AND a.percentage = 100
          AND (SELECT COUNT(*) FROM quiz_questions WHERE "quizSetId" = s.id) >= 5
      ) AS ok
    `),

    // Phase 10 — any phase whose every slot has every activity completed
    // (and has ≥1 slot with ≥1 activity). Scope through plan.userId so
    // cross-notebook paths count too.
    db.studyPhase.findFirst({
      where: {
        plan: { userId },
        slots: {
          some: {},
          every: {
            activities: { some: {}, every: { completed: true } },
          },
        },
      },
      select: { id: true },
    }),

    // Phase 10 — count of plans whose every phase has every slot fully
    // completed (drives both `path_complete` (≥1) and `two_paths` (≥2)).
    db.studyPlan.count({
      where: {
        userId,
        phases: {
          some: {},
          every: {
            slots: {
              some: {},
              every: {
                activities: { some: {}, every: { completed: true } },
              },
            },
          },
        },
      },
    }),

    // Phase 10 — first attempt per slot that scored 100%. ROW_NUMBER gives
    // us the earliest assessment attempt per slot; we check whether any of
    // those landed at 100% straight away (the "ace" pattern).
    db.$queryRaw<{ ok: boolean }[]>(Prisma.sql`
      SELECT EXISTS (
        SELECT 1 FROM (
          SELECT percentage,
                 ROW_NUMBER() OVER (PARTITION BY "slotId" ORDER BY "attemptedAt" ASC) AS rn
          FROM assessment_attempts
          WHERE "userId" = ${userId}
        ) t
        WHERE t.rn = 1 AND t.percentage = 100
      ) AS ok
    `),

    // Any single checkpoint slot with every activity completed → "first steps".
    db.checkpointSlot.findFirst({
      where: {
        phase: { plan: { userId } },
        activities: { some: {}, every: { completed: true } },
      },
      select: { id: true },
    }),
  ]);
  const hasPerfectQuiz = perfectQuizRow[0]?.ok === true;
  const hasPhaseComplete = !!phaseComplete;
  const hasPathComplete = pathCompleteCount >= 1;
  const hasCheckpointAce = checkpointAceRow[0]?.ok === true;
  const hasAnySectionComplete = !!sectionComplete;

  // ── Perfect first try ───────────────────────────────────────────────
  // A "perfect first try" is a 100% attempt with no earlier attempt on the
  // same quiz set. Instead of an N+1 (one findFirst per perfect attempt), we
  // fetch every perfect attempt plus the earliest attempt timestamp per set
  // in two flat queries, then compare in JS: a perfect attempt counts iff its
  // createdAt equals the earliest createdAt for that set (i.e. nothing strictly
  // earlier exists — identical to the old `createdAt < pa.createdAt` check,
  // including the tie case where the earliest attempt is itself perfect).
  const [perfectAttempts, earliestPerSet] = await Promise.all([
    db.quizAttempt.findMany({
      where: { userId, percentage: 100 },
      select: { quizSetId: true, createdAt: true },
    }),
    db.quizAttempt.groupBy({
      by: ['quizSetId'],
      where: { userId },
      _min: { createdAt: true },
    }),
  ]);
  const earliestBySet = new Map(
    earliestPerSet.map((g) => [g.quizSetId, g._min.createdAt]),
  );
  const hasPerfectFirstTry = perfectAttempts.some((pa) => {
    const earliest = earliestBySet.get(pa.quizSetId);
    // No earlier attempt exists ⇔ this attempt is at the earliest timestamp.
    return earliest === null || earliest === undefined
      ? true
      : pa.createdAt.getTime() <= earliest.getTime();
  });

  // ── Daily goal hit ──────────────────────────────────────────────────
  // "locked in" unlocks once the user has any single day with >=
  // DAILY_GOAL_MINUTES minutes recorded by the heartbeat. Raw SQL because
  // Prisma's groupBy doesn't support HAVING on a derived column.
  const dailyGoalRows = await db.$queryRaw<{ has_day: boolean }[]>(Prisma.sql`
    SELECT EXISTS (
      SELECT 1
      FROM study_minutes
      WHERE "userId" = ${userId}
      GROUP BY DATE("minute")
      HAVING COUNT(*) >= ${DAILY_GOAL_MINUTES}
    ) AS has_day
  `);
  const dailyGoalHit = dailyGoalRows[0]?.has_day === true;

  const tutorialState = (userRecord?.tutorialState ?? null) as { completedAt?: string } | null;

  return {
    notebookCount,
    currentStreak: streak?.currentStreak ?? 0,
    friendCount,
    sharedNotebookCount,
    groupCount,
    hasAllWrongQuiz: !!allWrongAttempt,
    hasPerfectFirstTry,
    usernameChanged: userRecord?.usernameChanged ?? false,
    examCount,
    folderCount,
    sharedStudyMaterialCount,
    canvasPageCount,
    allTodosDone: totalTodos > 0 && incompleteTodos === 0,
    scholarNameSet: !!userRecord?.scholarName,
    dailyGoalHit,
    tutorialCompleted: !!tutorialState?.completedAt,
    totalAchievementsUnlocked: unlockedCount,
    chatMessageCount,
    flashcardReviewCount: flashcardReviewAgg._sum.repetitions ?? 0,
    documentCount,
    quizSetCount,
    hasPerfectQuiz,
    maxQuizStreakEver: userRecord?.maxQuizStreakEver ?? 0,
    everHadComeback: userRecord?.everHadComeback ?? false,
    hasPhaseComplete,
    hasPathComplete,
    hasCheckpointAce,
    hasAnySectionComplete,
    pathCompleteCount,
  };
}

export async function checkAndUnlockAchievements(
  userId: string
): Promise<{ badge: string; name: string }[]> {
  // 1. Gather stats and existing achievements in parallel
  const [stats, existingAchievements] = await Promise.all([
    gatherUserStats(userId),
    db.achievement.findMany({
      where: { userId },
      select: { badge: true },
    }),
  ]);

  const unlockedBadges = new Set(existingAchievements.map((a) => a.badge));

  // ── Pass 1: Check all achievements except the meta-achievement ──────
  const newlyUnlocked: { badge: string; name: string; description: string; icon: string }[] = [];

  for (const achievement of ACHIEVEMENTS) {
    if (achievement.badge === 'all_achievements') continue;
    if (unlockedBadges.has(achievement.badge)) continue;
    if (!achievement.checkCondition(stats)) continue;

    newlyUnlocked.push({
      badge: achievement.badge,
      name: achievement.name,
      description: achievement.description,
      icon: achievement.icon,
    });
  }

  if (newlyUnlocked.length > 0) {
    await db.$transaction(
      newlyUnlocked.flatMap((a) => [
        db.achievement.create({
          data: { userId, badge: a.badge },
        }),
        db.notification.create({
          data: {
            userId,
            type: 'achievement_unlocked',
            data: {
              badge: a.badge,
              name: a.name,
              description: a.description,
              icon: a.icon,
            },
          },
        }),
      ])
    );

    // Update the set so pass 2 sees pass 1 results
    for (const a of newlyUnlocked) {
      unlockedBadges.add(a.badge);
    }

    await Promise.all(
      newlyUnlocked.map((a) =>
        unlockCosmeticsForAchievement(userId, a.badge).catch((err) => {
          console.error(`unlockCosmeticsForAchievement failed for ${a.badge}:`, err);
        })
      )
    );
  }

  // ── Pass 2: Check the meta-achievement ("Notemage") ─────────────────
  if (!unlockedBadges.has('all_achievements')) {
    const validUnlockedCount = [...unlockedBadges].filter((b) =>
      NON_META_BADGES.includes(b)
    ).length;

    if (validUnlockedCount >= NON_META_BADGES.length) {
      const metaDef = ACHIEVEMENTS.find((a) => a.badge === 'all_achievements')!;
      try {
        await db.$transaction([
          db.achievement.create({
            data: { userId, badge: 'all_achievements' },
          }),
          db.notification.create({
            data: {
              userId,
              type: 'achievement_unlocked',
              data: {
                badge: metaDef.badge,
                name: metaDef.name,
                description: metaDef.description,
                icon: metaDef.icon,
              },
            },
          }),
        ]);
        newlyUnlocked.push({
          badge: metaDef.badge,
          name: metaDef.name,
          description: metaDef.description,
          icon: metaDef.icon,
        });

        await unlockCosmeticsForAchievement(userId, metaDef.badge).catch((err) => {
          console.error(`unlockCosmeticsForAchievement failed for ${metaDef.badge}:`, err);
        });
      } catch {
        // Ignore P2002 unique constraint violation (race condition)
      }
    }
  }

  return newlyUnlocked.map(({ badge, name }) => ({ badge, name }));
}
