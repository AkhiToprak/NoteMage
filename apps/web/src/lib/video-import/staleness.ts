// P3 — shared staleness window for video-import jobs. A detached worker killed
// by a Coolify redeploy leaves the job wedged in `processing`/`queued` forever;
// past this TTL the GET/poll path treats it as stale (UI offers cancel/retry).
// All three video-job routes (progress SSE, retry, cancel) import this so the
// window is single-sourced.

/** A `processing`/`queued` video job idle longer than this is redeploy-killed. */
export const VIDEO_STALE_AFTER_MS = 20 * 60_000;

/** True when an unfinished job's last update is older than the staleness TTL. */
export function isVideoJobStale(status: string, updatedAt: Date): boolean {
  if (status !== 'processing' && status !== 'queued') return false;
  return Date.now() - updatedAt.getTime() > VIDEO_STALE_AFTER_MS;
}
