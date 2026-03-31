import { db } from '@/lib/db';
import { updateStreak } from '@/lib/streaks';

export async function recordActivity(userId: string, type: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  await db.activityEvent.upsert({
    where: { userId_date_type: { userId, date: today, type } },
    update: { count: { increment: 1 } },
    create: { userId, date: today, type, count: 1 },
  });

  // Fire and forget — don't slow down activity recording
  updateStreak(userId).catch(() => {});
}
