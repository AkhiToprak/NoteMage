import { db } from '@/lib/db';

const REMINDER_THRESHOLDS = [7, 3, 1]; // days before exam

/**
 * Check upcoming exams for a user and create reminder notifications
 * at 7 days, 3 days, and 1 day before the exam date.
 *
 * Avoids duplicates by checking for existing notifications with the
 * same exam ID and daysLeft value.
 *
 * Returns the count of newly created reminders.
 */
export async function checkExamReminders(userId: string): Promise<number> {
  const now = new Date();

  // Fetch upcoming exams with reminders enabled
  const exams = await db.exam.findMany({
    where: {
      userId,
      reminders: true,
      examDate: { gt: now },
    },
    select: {
      id: true,
      title: true,
      examDate: true,
      notebookId: true,
    },
  });

  if (exams.length === 0) return 0;

  // Fetch existing exam_reminder notifications for this user to check for duplicates
  const existingNotifications = await db.notification.findMany({
    where: {
      userId,
      type: 'exam_reminder',
    },
    select: {
      data: true,
    },
  });

  // Build a set of "examId:daysLeft" keys for quick duplicate checking
  const existingKeys = new Set<string>();
  for (const n of existingNotifications) {
    const data = n.data as { examId?: string; daysLeft?: number };
    if (data.examId && data.daysLeft !== undefined) {
      existingKeys.add(`${data.examId}:${data.daysLeft}`);
    }
  }

  let createdCount = 0;

  for (const exam of exams) {
    const daysUntilExam = Math.ceil((exam.examDate.getTime() - now.getTime()) / 86400000);

    for (const threshold of REMINDER_THRESHOLDS) {
      // Only create reminders when the exam is within the threshold window
      // (e.g., create the 7-day reminder when there are 7 or fewer days left,
      //  but not if we already created it)
      if (daysUntilExam > threshold) continue;

      const key = `${exam.id}:${threshold}`;
      if (existingKeys.has(key)) continue;

      await db.notification.create({
        data: {
          userId,
          type: 'exam_reminder',
          data: {
            examId: exam.id,
            examTitle: exam.title,
            daysLeft: threshold,
            notebookId: exam.notebookId,
          },
        },
      });

      existingKeys.add(key);
      createdCount++;
    }
  }

  return createdCount;
}
