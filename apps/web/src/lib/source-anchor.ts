// Source-highlighting feature — client-safe types + tiny pure helpers shared by
// the source-resolve route and the source viewer panes. NO server imports here
// (no `db`, no storage) so it can be pulled into client components freely.

/** Which pane the source viewer renders. */
export type SourceViewerType = 'pdf' | 'video' | 'text';

/**
 * The normalized, viewer-agnostic payload returned by GET /api/learn/sources/resolve.
 * `quote` is always present (the highlight target). `resolvable: false` means the
 * anchor had no openable origin (legacy / general-knowledge / deleted material) —
 * the viewer then shows the quote-only fallback.
 */
export interface ResolvedSource {
  resolvable: true;
  sourceType: SourceViewerType;
  title: string;
  quote: string;
  page?: number; // 1-based, pdf
  timestampSec?: number; // video seek target
  fileUrl?: string; // short-lived signed URL (pdf)
  videoUrl?: string; // origin URL (youtube)
  mediaType?: 'youtube' | 'upload';
  textContent?: string; // text/doc pane body (+ video transcript)
}

export interface UnresolvableSource {
  resolvable: false;
}

export type ResolveResult = ResolvedSource | UnresolvableSource;

/** Extract a YouTube video id from any common URL shape, or null. */
export function parseYouTubeId(url: string | null | undefined): string | null {
  if (!url) return null;
  // youtu.be/<id>, youtube.com/watch?v=<id>, /embed/<id>, /shorts/<id>, /live/<id>
  const patterns = [
    /(?:youtube\.com\/watch\?(?:.*&)?v=)([\w-]{11})/,
    /(?:youtu\.be\/)([\w-]{11})/,
    /(?:youtube\.com\/(?:embed|shorts|live)\/)([\w-]{11})/,
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m?.[1]) return m[1];
  }
  return null;
}

/** Build a privacy-friendly YouTube embed URL seeked to `startSec`, or null. */
export function youtubeEmbedUrl(
  url: string | null | undefined,
  startSec?: number | null,
): string | null {
  const id = parseYouTubeId(url);
  if (!id) return null;
  const start = startSec && startSec > 0 ? `?start=${Math.floor(startSec)}` : '';
  return `https://www.youtube-nocookie.com/embed/${id}${start}`;
}

/** Format seconds as M:SS (or H:MM:SS past an hour). */
export function formatTimestamp(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}
