// P3 — small shared helpers for the video-import submit + worker paths. Kept in
// src/lib so the route file exports only HTTP handlers (project route convention).

/** Minutes (rounded up, floor 1) charged/refunded for a video of `durationSec`.
 *  Video is metered in minutes (D4); a sub-minute clip still costs 1 minute.
 *  Tolerates a null duration (defensive: an under-specified row → 1 minute). */
export function minutesForDuration(durationSec: number | null | undefined): number {
  return Math.max(1, Math.ceil(Math.max(0, durationSec ?? 0) / 60));
}

/** YouTube-only allowlist (D8) — SSRF safety. Same shape as the Lane-1 route's
 *  inline `/youtube\.com|youtu\.be/` check, hoisted so both lanes share it. */
export function isYouTubeUrl(url: string): boolean {
  return /^https?:\/\/(www\.|m\.)?(youtube\.com|youtu\.be)\//.test(url.trim());
}
