import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { cacheGetOrSet } from '@/lib/redis-cache';
import { invalidateUnreadCount } from '@/lib/notification-cache';
import { ACHIEVEMENTS, UserStats } from './achievements';
import { unlockCosmeticsForAchievement } from './cosmetics/unlock';
import { weaknessTrainingUiEnabled, flashcardReviewQueueEnabled } from '@/lib/feature-flags';

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

// ~20 counts/lookups (several nested `every` anti-joins over the path tree).
// checkAndUnlockAchievements wraps this call in a 60s Redis cache because it
// fires on nearly every user action; achievements are monotonic, so a stale
// read only ever DELAYS an unlock (never causes a wrong one) and self-corrects
// on the next cache miss. Direct callers (the achievements page) get fresh data.
export async function gatherUserStats(userId: string): Promise<UserStats> {
  const [
    streak,
    friendCount,
    allWrongAttempt,
    userRecord,
    examCount,
    unlockedCount,
  ] = await Promise.all([
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
        // Denormalized SUM(Flashcard.repetitions), trigger-maintained — replaces
        // a join + aggregate over every card (see migration 20260717000000).
        flashcardRepetitionsSum: true,
      },
    }),

    // Exam count
    db.exam.count({ where: { userId } }),

    // Count of valid unlocked achievements (exclude orphaned old badges)
    db.achievement.count({
      where: { userId, badge: { in: VALID_BADGES } },
    }),
  ]);

  const [chatMessageCount, documentCount, quizSetCount] = await Promise.all([
    db.chatMessage.count({ where: { userId, role: 'user' } }),

    db.document.count({ where: { notebook: { userId } } }),

    // Phase 9.6 — QuizSet has direct userId now; no notebook hop.
    db.quizSet.count({ where: { userId } }),
  ]);

  // ── Phase 7 — personal learning-path rework gather ───────────────────────
  // The three completion rollups (phase / path / section complete) read the
  // trigger-maintained denormalized booleans instead of the old 3-level
  // nested-every anti-joins — same semantics (see migration 20260717000000),
  // now flat indexed lookups. The two $queryRaw checks stay: Prisma's where-
  // builder can't express them cheaply (perfect-on-a-5+-question-quiz,
  // first-attempt ace). `maxQuizStreakEver`, `everHadComeback`, and
  // `flashcardRepetitionsSum` are denormalized on User and arrive via
  // `userRecord` above — no extra query.
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

    // Any phase fully complete (≥1 slot, every slot allActivitiesDone). Scoped
    // through plan.userId so cross-notebook paths count too.
    db.studyPhase.findFirst({
      where: { allSlotsDone: true, plan: { userId } },
      select: { id: true },
    }),

    // Count of fully-complete plans (≥1 phase, every phase allSlotsDone).
    // Drives both `path_complete` (≥1) and `two_paths` (≥2).
    db.studyPlan.count({
      where: { userId, allPhasesDone: true },
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

    // Any single checkpoint slot fully complete → "first steps".
    db.checkpointSlot.findFirst({
      where: { allActivitiesDone: true, phase: { plan: { userId } } },
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

  // ── Weakness Training Phase 2 (§7.3) ────────────────────────────────
  // "Graduated" = a concept the user actually trained via a weakness-training
  // session that is now mastered/solid. Gated behind the UI flag: with it off
  // no WeaknessTrainingSession rows exist anyway, so 0 is correct and this
  // skips the extra queries for everyone else.
  let graduatedConceptCount = 0;
  if (weaknessTrainingUiEnabled()) {
    const sessions = await db.weaknessTrainingSession.findMany({
      where: { userId },
      select: { conceptIds: true },
    });
    const trainedIds = [...new Set(sessions.flatMap((s) => s.conceptIds))];
    if (trainedIds.length > 0) {
      const solid = await db.conceptMastery.findMany({
        where: { userId, conceptId: { in: trainedIds }, status: 'solid' },
        select: { conceptId: true },
      });
      graduatedConceptCount = solid.length;
    }
  }

  // ── Weakness Training Phase 4.3c (§13.7) — review-queue gather ─────────
  // Gated behind the review-queue flag the same way graduatedConceptCount
  // is gated behind the training-UI flag: with it off, no flashcard grading
  // happens through this surface (the 4.3b batch route still writes
  // lastReviewAt for review-slot decks regardless, but the queue-emptying
  // and streak achievements are specific to this surface being live).
  let clearedReviewQueueToday = false;
  let reviewStreakDays = 0;
  if (flashcardReviewQueueEnabled()) {
    const now = new Date();
    const [gradedToday, dueNowCount] = await Promise.all([
      db.flashcard.count({
        where: {
          flashcardSet: { userId },
          lastReviewAt: { gte: new Date(new Date().setUTCHours(0, 0, 0, 0)) },
        },
      }),
      db.flashcard.count({
        where: {
          flashcardSet: { userId },
          OR: [{ nextReviewAt: null }, { nextReviewAt: { lte: now } }],
        },
      }),
    ]);
    clearedReviewQueueToday = gradedToday > 0 && dueNowCount === 0;

    // Longest run of consecutive calendar days (ending today or yesterday —
    // an open streak) with >= 1 graded review, capped at 7 (all this check
    // needs). `lastReviewAt::date` distinct days, gaps-and-islands via the
    // date minus a row-number trick, only over the last 7 days.
    const streakRows = await db.$queryRaw<{ streak: number }[]>(Prisma.sql`
      WITH days AS (
        SELECT DISTINCT ("lastReviewAt" AT TIME ZONE 'UTC')::date AS d
        FROM flashcards f
        JOIN flashcard_sets s ON s.id = f."flashcardSetId"
        WHERE s."userId" = ${userId}
          AND "lastReviewAt" >= (CURRENT_DATE - INTERVAL '6 days')
      ),
      islands AS (
        SELECT d, d - (ROW_NUMBER() OVER (ORDER BY d))::int AS grp
        FROM days
      ),
      runs AS (
        SELECT MIN(d) AS start_d, MAX(d) AS end_d, COUNT(*) AS len
        FROM islands
        GROUP BY grp
      )
      SELECT COALESCE(MAX(len), 0)::int AS streak
      FROM runs
      WHERE end_d >= CURRENT_DATE - INTERVAL '1 day'
    `);
    reviewStreakDays = streakRows[0]?.streak ?? 0;
  }

  return {
    currentStreak: streak?.currentStreak ?? 0,
    friendCount,
    hasAllWrongQuiz: !!allWrongAttempt,
    hasPerfectFirstTry,
    usernameChanged: userRecord?.usernameChanged ?? false,
    examCount,
    scholarNameSet: !!userRecord?.scholarName,
    dailyGoalHit,
    tutorialCompleted: !!tutorialState?.completedAt,
    totalAchievementsUnlocked: unlockedCount,
    chatMessageCount,
    flashcardReviewCount: userRecord?.flashcardRepetitionsSum ?? 0,
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
    graduatedConceptCount,
    clearedReviewQueueToday,
    reviewStreakDays,
  };
}

export async function checkAndUnlockAchievements(
  userId: string
): Promise<{ badge: string; name: string }[]> {
  // 1. Cheap point query first (indexed on Achievement.userId). If the meta-
  // achievement is already unlocked, every badge is done — skip the ~20-query
  // stats gather entirely. This is the biggest win: a "finished" user otherwise
  // pays the full gather on every chat message / quiz attempt / activity forever.
  const existingAchievements = await db.achievement.findMany({
    where: { userId },
    select: { badge: true },
  });
  const unlockedBadges = new Set(existingAchievements.map((a) => a.badge));
  if (unlockedBadges.has('all_achievements')) return [];

  // 2. Gather stats, cached 60s per user (see gatherUserStats note). None of the
  // hot callers need per-request freshness, and this is what fires on every
  // action — the cache removes the fan-out from the hot path.
  const stats = await cacheGetOrSet(
    `achievement-stats:${userId}`,
    60,
    () => gatherUserStats(userId),
  );

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

  // New badges wrote unread achievement_unlocked notifications — drop the cached
  // unread count so the bell reflects them without waiting for the TTL.
  if (newlyUnlocked.length > 0) {
    await invalidateUnreadCount(userId).catch(() => {});
  }

  return newlyUnlocked.map(({ badge, name }) => ({ badge, name }));
}
