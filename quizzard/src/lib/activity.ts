import { db } from '@/lib/db';

export async function recordActivity(userId: string, type: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  await db.activityEvent.upsert({
    where: { userId_date_type: { userId, date: today, type } },
    update: { count: { increment: 1 } },
    create: { userId, date: today, type, count: 1 },
  });
}
