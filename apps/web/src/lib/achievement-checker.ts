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

    // User record for level, usernameChanged, scholarName, tutorial state
    db.user.findUnique({
      where: { id: userId },
      select: {
        level: true,
        usernameChanged: true,
        scholarName: true,
        tutorialState: true,
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

  // ── New triggers for PR 1 (achievement-bound cosmetics) ─────────────
  // Run as a separate Promise.all so the existing block above stays
  // diff-friendly. These are independent counts; no sequential logic.
  const [
    chatMessageCount,
    flashcardReviewAgg,
    documentCount,
    quizSetCount,
  ] = await Promise.all([
    // Mage-assistant messages authored by the user. role='user' filters out
    // assistant replies. Anchored on the userId index already on
    // chat_messages so this stays a cheap count.
    db.chatMessage.count({ where: { userId, role: 'user' } }),

    // Flashcard reviews — the SR pipeline doesn't store a per-review row,
    // it only bumps `repetitions` on the Flashcard. Sum that across every
    // flashcard the user owns to get a total review count. Traverses
    // Flashcard -> FlashcardSet -> Notebook -> User.
    db.flashcard.aggregate({
      _sum: { repetitions: true },
      where: { flashcardSet: { notebook: { userId } } },
    }),

    // Documents the user has uploaded into any of their notebooks.
    db.document.count({ where: { notebook: { userId } } }),

    // Quiz sets created in any of the user's notebooks (AI-generated +
    // manual both count — the achievement is "created any quiz").
    db.quizSet.count({ where: { notebook: { userId } } }),
  ]);

  // ── Perfect first try (needs sequential logic) ──────────────────────
  let hasPerfectFirstTry = false;
  const perfectAttempts = await db.quizAttempt.findMany({
    where: { userId, percentage: 100 },
    select: { quizSetId: true, createdAt: true },
  });
  for (const pa of perfectAttempts) {
    const earlierAttempt = await db.quizAttempt.findFirst({
      where: {
        userId,
        quizSetId: pa.quizSetId,
        createdAt: { lt: pa.createdAt },
      },
      select: { id: true },
    });
    if (!earlierAttempt) {
      hasPerfectFirstTry = true;
      break;
    }
  }

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

  const tutorialState = (userRecord?.tutorialState ?? null) as
    | { completedAt?: string }
    | null;

  return {
    notebookCount,
    currentStreak: streak?.currentStreak ?? 0,
    friendCount,
    sharedNotebookCount,
    groupCount,
    hasAllWrongQuiz: !!allWrongAttempt,
    hasPerfectFirstTry,
    userLevel: userRecord?.level ?? 1,
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

    // PR 1 — fan out cosmetic unlocks for each newly-granted achievement.
    // Runs in parallel with the level-bound path in xp.ts; both write to
    // UserCosmetic and rely on its compound primary key (userId, cosmeticId)
    // for idempotency. Errors per-achievement are logged but don't block
    // the rest — same fire-and-forget posture as the level-up path.
    await Promise.all(
      newlyUnlocked.map((a) =>
        unlockCosmeticsForAchievement(userId, a.badge).catch((err) => {
          console.error(
            `unlockCosmeticsForAchievement failed for ${a.badge}:`,
            err
          );
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

        // PR 1 — grant the meta-achievement's cosmetic bundle the same way
        // pass 1 does. Wrapped because this branch only runs when the
        // create succeeded above (the catch swallows races).
        await unlockCosmeticsForAchievement(userId, metaDef.badge).catch(
          (err) => {
            console.error(
              `unlockCosmeticsForAchievement failed for ${metaDef.badge}:`,
              err
            );
          }
        );
      } catch {
        // Ignore P2002 unique constraint violation (race condition)
      }
    }
  }

  return newlyUnlocked.map(({ badge, name }) => ({ badge, name }));
}
