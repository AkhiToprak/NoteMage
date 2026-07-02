import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';

/**
 * Exam Mode (Phase 6) — DB-backed notification/reminder preferences.
 *
 * Replaces the old localStorage-only settings. A user with no row gets
 * {@link DEFAULT_NOTIFICATION_PREFS} (opt-in: reminders + email on), so the
 * reminder sweep keeps working for existing users without a backfill.
 *
 * Every read is defensive: until migration `20260702000000_exam_reminders`
 * lands in an environment, the table doesn't exist. Rather than 500 the
 * settings page or wedge the cron sweep, a missing-table error falls back to
 * the defaults. (Coolify applies migrations out-of-band — see the Phase 0–5
 * memory notes about unapplied exam migrations.)
 */

export interface NotificationPreferences {
  /** Exam countdown — "X is in N days" at 7 / 3 / 1 days before the exam. */
  examReminders: boolean;
  /** Readiness nudges — when an exam is close and the learner is behind. */
  readinessAlerts: boolean;
  /** Also deliver the above reminders by email (in addition to in-app). */
  emailReminders: boolean;
  /** Marketing / digest channels (no automated sender yet). */
  productUpdates: boolean;
  weeklyReport: boolean;
  /** Weakness Training Phase 4.4 — master opt-out for the weak-spot nudge
   *  system (in-app AND the weekly email digest; one flag for both
   *  channels, see plan §14.5 / §16 Q11). */
  weakSpotNudges: boolean;
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPreferences = {
  examReminders: true,
  readinessAlerts: true,
  emailReminders: true,
  productUpdates: true,
  weeklyReport: false,
  weakSpotNudges: true,
};

export const NOTIFICATION_PREF_KEYS = Object.keys(
  DEFAULT_NOTIFICATION_PREFS,
) as (keyof NotificationPreferences)[];

/** A Prisma error meaning the table/column isn't there yet (pre-migration). */
function isMissingRelationError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === 'P2021' || error.code === 'P2022')
  );
}

function pickPrefs(row: {
  examReminders: boolean;
  readinessAlerts: boolean;
  emailReminders: boolean;
  productUpdates: boolean;
  weeklyReport: boolean;
  weakSpotNudges: boolean;
}): NotificationPreferences {
  return {
    examReminders: row.examReminders,
    readinessAlerts: row.readinessAlerts,
    emailReminders: row.emailReminders,
    productUpdates: row.productUpdates,
    weeklyReport: row.weeklyReport,
    weakSpotNudges: row.weakSpotNudges,
  };
}

/**
 * Load a user's preferences, falling back to {@link DEFAULT_NOTIFICATION_PREFS}
 * when no row exists OR the table isn't migrated yet. Never throws.
 */
export async function loadNotificationPreferences(
  userId: string,
): Promise<NotificationPreferences> {
  try {
    const row = await db.userNotificationPreferences.findUnique({ where: { userId } });
    return row ? pickPrefs(row) : { ...DEFAULT_NOTIFICATION_PREFS };
  } catch (error) {
    if (isMissingRelationError(error)) return { ...DEFAULT_NOTIFICATION_PREFS };
    throw error;
  }
}

/** Coerce an unknown PUT body into a full, validated preferences object. */
export function parseNotificationPreferences(raw: unknown): NotificationPreferences {
  const body = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const out = { ...DEFAULT_NOTIFICATION_PREFS };
  for (const key of NOTIFICATION_PREF_KEYS) {
    if (typeof body[key] === 'boolean') out[key] = body[key] as boolean;
  }
  return out;
}

/**
 * Upsert a user's preferences. Returns the persisted object. Propagates a
 * missing-table error to the caller (the API route maps it to a clear 503) —
 * unlike the read path, a *write* shouldn't silently pretend to succeed.
 */
export async function saveNotificationPreferences(
  userId: string,
  prefs: NotificationPreferences,
): Promise<NotificationPreferences> {
  const row = await db.userNotificationPreferences.upsert({
    where: { userId },
    create: { userId, ...prefs },
    update: { ...prefs },
  });
  return pickPrefs(row);
}

export { isMissingRelationError as isMissingNotificationPrefRelation };
