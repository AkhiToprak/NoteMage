import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { loadExamReadiness } from '@/lib/exam-scope';
import {
  DEFAULT_NOTIFICATION_PREFS,
  type NotificationPreferences,
} from '@/lib/notification-preferences';
import { sendExamReminderEmail } from '@/lib/exam-reminder-email';

/**
 * Exam Mode (Phase 6) — the exam-reminder sweep, run by the `reminders.sweep`
 * background job (see background-job-runner.ts). It is GLOBAL (all users) and
 * idempotent: every reminder it would create is keyed and deduped against the
 * notifications already on record, so running the sweep many times a day (or a
 * retried job) never double-notifies.
 *
 * Two reminder kinds, each gated by a `UserNotificationPreferences` flag:
 *   • countdown  → `exam_reminder`        (examReminders)   — "X is in N days"
 *   • readiness  → `exam_readiness_low`   (readinessAlerts) — "you're behind"
 *
 * In-app notifications are the source of truth; email (when `emailReminders`)
 * is a best-effort second channel.
 */

// Countdown buckets (days before exam). Each fires at most once per exam, in
// descending order, as the exam approaches — see {@link countdownBucket}.
const COUNTDOWN_BUCKETS = [7, 3, 1, 0] as const;

// Readiness nudges only fire inside this window and only when the learner is
// behind. Tight so they don't fire for far-off exams or well-prepared ones.
const READINESS_WINDOW_DAYS = 5;
const READINESS_THRESHOLD = 65; // below this (and graded) → "you're behind"

// Bound the global query so one sweep can't fan out unboundedly.
const MAX_EXAMS_PER_SWEEP = 1000;

const MS_PER_DAY = 86_400_000;

function getAppUrl(): string {
  return (process.env.NEXTAUTH_URL || 'https://notemage.app').replace(/\/$/, '');
}

/** Whole days until `date` (0 = today, 1 = tomorrow). */
function daysUntil(date: Date, now: Date): number {
  return Math.ceil((date.getTime() - now.getTime()) / MS_PER_DAY);
}

/**
 * The countdown bucket to fire for a given days-until, or null when the exam is
 * still further out than the largest bucket. The bucket is the SMALLEST one the
 * exam has reached, so a late-created exam doesn't dump every past bucket at
 * once — it fires the most relevant single reminder, then the next as days tick
 * down. The notification copy uses the real days-until, not the bucket value.
 */
export function countdownBucket(days: number): number | null {
  let bucket: number | null = null;
  for (const t of COUNTDOWN_BUCKETS) {
    if (days <= t) bucket = t; // keeps narrowing to the smallest reached bucket
  }
  return bucket;
}

/** UTC day key (YYYY-MM-DD) — readiness nudges fire at most once per exam/day. */
function dayKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

type SweepExam = {
  id: string;
  userId: string;
  title: string;
  examDate: Date;
  notebookId: string;
  user: { email: string };
};

function isMissingRelationError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === 'P2021' || error.code === 'P2022')
  );
}

/** Load every user's prefs in one query, defaulting on a missing-table error. */
async function loadPrefsForUsers(
  userIds: string[],
): Promise<Map<string, NotificationPreferences>> {
  const map = new Map<string, NotificationPreferences>();
  if (userIds.length === 0) return map;
  try {
    const rows = await db.userNotificationPreferences.findMany({
      where: { userId: { in: userIds } },
    });
    for (const r of rows) {
      map.set(r.userId, {
        examReminders: r.examReminders,
        readinessAlerts: r.readinessAlerts,
        emailReminders: r.emailReminders,
        productUpdates: r.productUpdates,
        weeklyReport: r.weeklyReport,
      });
    }
  } catch (error) {
    if (!isMissingRelationError(error)) throw error;
    // Pre-migration: every user falls back to defaults below.
  }
  return map;
}

/**
 * Build the set of dedupe keys from notifications already on record for these
 * users, so we never re-create a reminder. Keys:
 *   • `exam_reminder:<examId>:<bucket>`
 *   • `exam_readiness_low:<examId>:<YYYY-MM-DD>`
 */
async function loadFiredKeys(userIds: string[]): Promise<Set<string>> {
  const fired = new Set<string>();
  if (userIds.length === 0) return fired;
  const since = new Date(Date.now() - 14 * MS_PER_DAY);
  const rows = await db.notification.findMany({
    where: {
      userId: { in: userIds },
      type: { in: ['exam_reminder', 'exam_readiness_low'] },
      createdAt: { gte: since },
    },
    select: { type: true, data: true },
  });
  for (const n of rows) {
    const data = (n.data ?? {}) as Record<string, unknown>;
    const examId = typeof data.examId === 'string' ? data.examId : null;
    if (!examId) continue;
    if (n.type === 'exam_reminder') {
      const bucket =
        typeof data.bucket === 'number'
          ? data.bucket
          : typeof data.daysLeft === 'number'
            ? data.daysLeft
            : null;
      if (bucket !== null) fired.add(`exam_reminder:${examId}:${bucket}`);
    } else {
      const day = typeof data.day === 'string' ? data.day : null;
      if (day) fired.add(`exam_readiness_low:${examId}:${day}`);
    }
  }
  return fired;
}

export interface ReminderSweepResult {
  examsScanned: number;
  created: number;
  emailed: number;
}

/**
 * Run the global exam-reminder sweep once. Safe to call repeatedly. Returns a
 * small summary for logging.
 */
export async function runExamReminderSweep(): Promise<ReminderSweepResult> {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + 8 * MS_PER_DAY);

  const exams = (await db.exam.findMany({
    where: { reminders: true, examDate: { gt: now, lte: windowEnd } },
    select: {
      id: true,
      userId: true,
      title: true,
      examDate: true,
      notebookId: true,
      user: { select: { email: true } },
    },
    orderBy: { examDate: 'asc' },
    take: MAX_EXAMS_PER_SWEEP,
  })) as SweepExam[];

  if (exams.length === 0) return { examsScanned: 0, created: 0, emailed: 0 };

  const userIds = [...new Set(exams.map((e) => e.userId))];
  const [prefsMap, fired] = await Promise.all([
    loadPrefsForUsers(userIds),
    loadFiredKeys(userIds),
  ]);

  const appUrl = getAppUrl();
  const today = dayKey(now);
  let created = 0;
  let emailed = 0;

  for (const exam of exams) {
    const prefs = prefsMap.get(exam.userId) ?? DEFAULT_NOTIFICATION_PREFS;
    const days = daysUntil(exam.examDate, now);
    const examUrl = `${appUrl}/exam/${exam.id}`;

    // ── Countdown ────────────────────────────────────────────────────────────
    if (prefs.examReminders) {
      const bucket = countdownBucket(days);
      const key = bucket === null ? null : `exam_reminder:${exam.id}:${bucket}`;
      if (key && !fired.has(key)) {
        try {
          await db.notification.create({
            data: {
              userId: exam.userId,
              type: 'exam_reminder',
              data: {
                examId: exam.id,
                examTitle: exam.title,
                daysLeft: Math.max(days, 0),
                bucket,
                notebookId: exam.notebookId,
              },
            },
          });
          fired.add(key);
          created++;
          if (prefs.emailReminders && exam.user.email) {
            const ok = await sendExamReminderEmail(exam.user.email, {
              examTitle: exam.title,
              kind: 'countdown',
              daysLeft: Math.max(days, 0),
              examUrl,
            });
            if (ok) emailed++;
          }
        } catch (error) {
          console.error(`[reminders] countdown failed for exam ${exam.id}`, error);
        }
      }
    }

    // ── Readiness nudge ──────────────────────────────────────────────────────
    // Dedupe BEFORE the (heavier) readiness compute so we touch the rollup at
    // most once per exam per day.
    if (prefs.readinessAlerts && days >= 0 && days <= READINESS_WINDOW_DAYS) {
      const key = `exam_readiness_low:${exam.id}:${today}`;
      if (!fired.has(key)) {
        try {
          const result = await loadExamReadiness(exam.userId, exam.id);
          if (
            result &&
            result.readiness.hasGradedMaterial &&
            !result.readiness.isEmpty &&
            result.readiness.readiness < READINESS_THRESHOLD
          ) {
            const weakCount = result.readiness.weakTopics.length;
            await db.notification.create({
              data: {
                userId: exam.userId,
                type: 'exam_readiness_low',
                data: {
                  examId: exam.id,
                  examTitle: exam.title,
                  daysLeft: days,
                  readiness: result.readiness.readiness,
                  weakCount,
                  day: today,
                  notebookId: exam.notebookId,
                },
              },
            });
            fired.add(key);
            created++;
            if (prefs.emailReminders && exam.user.email) {
              const ok = await sendExamReminderEmail(exam.user.email, {
                examTitle: exam.title,
                kind: 'readiness',
                daysLeft: days,
                examUrl,
                readiness: result.readiness.readiness,
                weakCount,
              });
              if (ok) emailed++;
            }
          } else {
            // Prepared (or nothing scoped) — mark handled for today so we don't
            // recompute readiness on every sweep.
            fired.add(key);
          }
        } catch (error) {
          console.error(`[reminders] readiness failed for exam ${exam.id}`, error);
        }
      }
    }
  }

  return { examsScanned: exams.length, created, emailed };
}
