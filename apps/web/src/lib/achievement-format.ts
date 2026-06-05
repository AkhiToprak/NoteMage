/**
 * Shared unlock-date formatter for the achievement surfaces (TrophyShelf,
 * DashboardAchievements, RecentTrophies). Each component used to inline its
 * own `toLocaleDateString` call with a different shape (full date vs
 * month/day vs day/month, en-US vs locale-aware), so the same unlock read
 * three different ways across the app. This is the single source.
 *
 * Locale-aware (undefined locale) so non-US users get their own ordering,
 * and it guards against an invalid/empty timestamp rather than rendering
 * "Invalid Date".
 */
export function formatAchievementDate(iso: string, opts?: { withYear?: boolean }): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    ...(opts?.withYear ? { year: 'numeric' } : {}),
  });
}
