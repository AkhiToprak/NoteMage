// P3 — shared manual-retry staleness window for video-import domain rows. The
// durable background queue reclaims crashed jobs by lease; this TTL only keeps
// the user's explicit retry/cancel affordances conservative.

/** A `processing`/`queued` video job idle longer than this may be retried. */
export const VIDEO_STALE_AFTER_MS = 20 * 60_000;

/** True when an unfinished job's last update is older than the staleness TTL. */
export function isVideoJobStale(status: string, updatedAt: Date): boolean {
  if (status !== 'processing' && status !== 'queued') return false;
  return Date.now() - updatedAt.getTime() > VIDEO_STALE_AFTER_MS;
}
