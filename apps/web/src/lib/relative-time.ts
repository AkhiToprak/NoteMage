// Shared relative-time formatter. Uses Intl.RelativeTimeFormat for i18n with
// manual unit bucketing. Replaces the per-page copies that had drifted (one
// rendered "2d ago", the other localized "2 days ago").
export function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'recently';
  const diffMs = then - Date.now();
  const absSec = Math.abs(diffMs) / 1000;
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  if (absSec < 60) return rtf.format(Math.round(diffMs / 1000), 'second');
  if (absSec < 3600) return rtf.format(Math.round(diffMs / 60000), 'minute');
  if (absSec < 86400) return rtf.format(Math.round(diffMs / 3600000), 'hour');
  if (absSec < 2592000) return rtf.format(Math.round(diffMs / 86400000), 'day');
  if (absSec < 31536000) return rtf.format(Math.round(diffMs / (86400000 * 30)), 'month');
  return rtf.format(Math.round(diffMs / (86400000 * 365)), 'year');
}
