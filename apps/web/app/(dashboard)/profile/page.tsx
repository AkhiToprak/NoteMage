import { redirect } from 'next/navigation';
import { getServerAuthToken } from '@/lib/server-auth';
import { db } from '@/lib/db';
import { loadPathsForUser, serializePath } from '@/lib/path-loader';
import { derivePathStats } from '@/lib/path-stats';
import type { PathPlan } from '@/components/learn/PathView';
import { getStreakInfo } from '@/lib/streaks';
import { checkAndUnlockAchievements } from '@/lib/achievement-checker';
import { ACHIEVEMENTS } from '@/lib/achievements';
import ProfileView, { type ProfileData, type UnlockedItem } from './ProfileView';

/* Profile (Web). Server component: profile, streak, active-path count, quiz
   stats and achievements are resolved during SSR (the same sources the five
   client fetches used) so the first byte carries real content — no spinner,
   no client waterfall. Only the declared ProfileData fields are selected, so
   nothing extra crosses to the client. */

export const dynamic = 'force-dynamic';

const PROFILE_SELECT = {
  id: true,
  username: true,
  name: true,
  bio: true,
  avatarUrl: true,
  dailyGoal: true,
  age: true,
  location: true,
  school: true,
  lineOfWork: true,
  instagramHandle: true,
  linkedinUrl: true,
  profilePrivate: true,
  hideAchievements: true,
  createdAt: true,
  role: true,
} as const;

export default async function ProfilePage() {
  const token = await getServerAuthToken();
  if (!token?.id) redirect('/auth/login');

  const userId = token.id as string;
  const userEmail = (token.email as string | undefined) ?? '';
  const userTier = (token.tier as string | undefined) ?? 'free';

  let profile: ProfileData | null = null;
  let errored = false;
  let streak = 0;
  let activePaths = 0;
  let quizStats = { questionsAnswered: 0, accuracy: null as number | null };
  let achievements: UnlockedItem[] = [];

  try {
    const [profileData, streakData, plans, quizAgg] = await Promise.all([
      db.user.findUnique({ where: { id: userId }, select: PROFILE_SELECT }),
      getStreakInfo(userId),
      loadPathsForUser(userId),
      db.quizAttempt.aggregate({ where: { userId }, _sum: { total: true, score: true } }),
    ]);

    if (!profileData) {
      errored = true;
    } else {
      profile = { ...profileData, createdAt: profileData.createdAt.toISOString() };
    }

    streak = streakData.currentStreak;

    // Same computation the old client did over /api/learn/paths: count paths that
    // aren't generating, have slots, and are < 100% complete (derivePathStats).
    activePaths = plans
      .map(serializePath)
      .filter(
        (p) =>
          p.generationStatus !== 'generating' &&
          p.phases.some((ph) => ph.slots.length > 0) &&
          derivePathStats(p as unknown as PathPlan).progressPct < 100,
      ).length;

    const questionsAnswered = quizAgg._sum.total ?? 0;
    const correct = quizAgg._sum.score ?? 0;
    quizStats = {
      questionsAnswered,
      accuracy: questionsAnswered > 0 ? Math.round((correct / questionsAnswered) * 100) : null,
    };

    // Achievements: run the unlock check (same as the old /api/user/achievements
    // own-user branch), then read the unlocked set, newest first, joined to the
    // catalog. count is the array length.
    await checkAndUnlockAchievements(userId);
    const unlockedRecords = await db.achievement.findMany({
      where: { userId },
      select: { badge: true, unlockedAt: true },
      orderBy: { unlockedAt: 'desc' },
    });
    achievements = unlockedRecords.map((r) => {
      const meta = ACHIEVEMENTS.find((a) => a.badge === r.badge);
      return {
        badge: r.badge,
        name: meta?.name,
        description: meta?.description,
        icon: meta?.icon,
        unlockedAt: r.unlockedAt.toISOString(),
      };
    });
  } catch (err) {
    console.error('[profile page]', err);
    errored = true;
  }

  return (
    <ProfileView
      profile={profile}
      errored={errored}
      streak={streak}
      activePaths={activePaths}
      quizStats={quizStats}
      achievements={achievements}
      userEmail={userEmail}
      userTier={userTier}
    />
  );
}
