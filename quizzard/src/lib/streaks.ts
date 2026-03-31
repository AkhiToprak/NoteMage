import { db } from '@/lib/db';

function toDateString(date: Date): string {
  return date.toISOString().split('T')[0];
}

function getToday(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export async function updateStreak(userId: string) {
  const today = getToday();
  const todayStr = toDateString(today);

  const streak = await db.userStreak.upsert({
    where: { userId },
    create: { userId, currentStreak: 0, longestStreak: 0, freezesLeft: 2, freezesUsed: 0 },
    update: {},
  });

  const lastStr = streak.lastStudyDate ? toDateString(streak.lastStudyDate) : null;

  // Already studied today — no change
  if (lastStr === todayStr) {
    return streak;
  }

  const yesterday = new Date(today);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yesterdayStr = toDateString(yesterday);

  const twoDaysAgo = new Date(today);
  twoDaysAgo.setUTCDate(twoDaysAgo.getUTCDate() - 2);
  const twoDaysAgoStr = toDateString(twoDaysAgo);

  let newCurrentStreak: number;
  let newFreezesLeft = streak.freezesLeft;
  let newFreezesUsed = streak.freezesUsed;

  if (lastStr === yesterdayStr) {
    // Consecutive day — increment streak
    newCurrentStreak = streak.currentStreak + 1;
  } else if (lastStr === twoDaysAgoStr && streak.freezesLeft > 0) {
    // Missed one day but have a freeze — use it and keep streak
    newCurrentStreak = streak.currentStreak + 1;
    newFreezesLeft = streak.freezesLeft - 1;
    newFreezesUsed = streak.freezesUsed + 1;
  } else {
    // Streak broken — reset to 1 (today counts)
    newCurrentStreak = 1;
  }

  const newLongestStreak = Math.max(streak.longestStreak, newCurrentStreak);

  return db.userStreak.update({
    where: { userId },
    data: {
      currentStreak: newCurrentStreak,
      longestStreak: newLongestStreak,
      lastStudyDate: today,
      freezesLeft: newFreezesLeft,
      freezesUsed: newFreezesUsed,
    },
  });
}

export async function getStreakInfo(userId: string): Promise<{
  currentStreak: number;
  longestStreak: number;
  freezesLeft: number;
  isActiveToday: boolean;
}> {
  const streak = await db.userStreak.findUnique({ where: { userId } });

  if (!streak) {
    return {
      currentStreak: 0,
      longestStreak: 0,
      freezesLeft: 2,
      isActiveToday: false,
    };
  }

  const todayStr = toDateString(getToday());
  const lastStr = streak.lastStudyDate ? toDateString(streak.lastStudyDate) : null;

  return {
    currentStreak: streak.currentStreak,
    longestStreak: streak.longestStreak,
    freezesLeft: streak.freezesLeft,
    isActiveToday: lastStr === todayStr,
  };
}
