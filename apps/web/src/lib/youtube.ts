import {
  YoutubeTranscript,
  YoutubeTranscriptDisabledError,
  YoutubeTranscriptNotAvailableError,
  YoutubeTranscriptVideoUnavailableError,
} from 'youtube-transcript';

/**
 * Thrown when a video has no captions to extract (disabled or absent). Routes
 * branch on this to return a distinct 422 — the handoff seam to native video
 * notes (Lane 2) — instead of a generic 500.
 */
export class CaptionsUnavailableError extends Error {
  constructor(message = 'No captions found for this video') {
    super(message);
    this.name = 'CaptionsUnavailableError';
  }
}

/**
 * Thrown when the video itself can't be reached (deleted / private / unlisted).
 * Distinct from CaptionsUnavailableError: a missing video can't be served by the
 * native-video fallback either, so routes return a 400 — NOT the 422 upsell.
 */
export class VideoUnavailableError extends Error {
  constructor(message = "Couldn't read this video.") {
    super(message);
    this.name = 'VideoUnavailableError';
  }
}

// ── YouTube video search (Data API v3) ──

export interface YouTubeVideoResult {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string;
  publishedAt: string;
}

export async function searchYouTubeVideos(
  query: string,
  maxResults: number = 3
): Promise<YouTubeVideoResult[]> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    throw new Error('YOUTUBE_API_KEY is not configured');
  }

  const params = new URLSearchParams({
    part: 'snippet',
    q: query,
    type: 'video',
    maxResults: String(Math.min(Math.max(maxResults, 1), 5)),
    relevanceLanguage: 'en',
    safeSearch: 'strict',
    videoEmbeddable: 'true',
    key: apiKey,
  });

  const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`);
  if (!res.ok) {
    throw new Error(`YouTube API error: ${res.status}`);
  }

  const data = await res.json();

  return (data.items || []).map((item: Record<string, unknown>) => {
    const id = item.id as Record<string, string>;
    const snippet = item.snippet as Record<string, unknown>;
    const thumbnails = snippet.thumbnails as Record<string, Record<string, string>> | undefined;
    return {
      videoId: id.videoId,
      title: snippet.title as string,
      channelTitle: snippet.channelTitle as string,
      thumbnailUrl: thumbnails?.medium?.url || thumbnails?.default?.url || '',
      publishedAt: snippet.publishedAt as string,
    };
  });
}

/**
 * Extract a YouTube video ID from various URL formats.
 * Supports: youtube.com/watch?v=, youtu.be/, youtube.com/embed/, youtube.com/shorts/
 */
export function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?.*v=)([a-zA-Z0-9_-]{11})/,
    /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }

  return null;
}

/**
 * Fetch the transcript and metadata for a YouTube video.
 */
export async function extractYouTubeTranscript(url: string) {
  const videoId = extractVideoId(url);
  if (!videoId) {
    throw new Error('Invalid YouTube URL');
  }

  // Fetch video title from oEmbed API
  let title = 'Unknown Title';
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
    const response = await fetch(oembedUrl);
    if (response.ok) {
      const data = await response.json();
      title = data.title || title;
    }
  } catch {
    // Title fetch failed — use fallback
  }

  // Fetch transcript segments. A captionless video (disabled or no track)
  // surfaces as a typed library error — re-throw it as the domain error so
  // the route can distinguish it (422 → native-video upsell) from a fault.
  let rawSegments;
  try {
    rawSegments = await YoutubeTranscript.fetchTranscript(videoId);
  } catch (err) {
    if (err instanceof YoutubeTranscriptVideoUnavailableError) {
      throw new VideoUnavailableError();
    }
    if (
      err instanceof YoutubeTranscriptDisabledError ||
      err instanceof YoutubeTranscriptNotAvailableError
    ) {
      throw new CaptionsUnavailableError();
    }
    throw err;
  }
  if (rawSegments.length === 0) {
    throw new CaptionsUnavailableError();
  }

  const segments = rawSegments.map((segment) => ({
    text: segment.text,
    offset: segment.offset,
    duration: segment.duration,
  }));

  const transcript = assembleTimestampedTranscript(segments);

  return {
    title,
    videoId,
    transcript,
    segments,
  };
}

/**
 * Approximate a video's length (seconds) from its caption segments — the latest
 * caption end. Server-side and trustworthy (derived from the track we just
 * fetched), so it can meter video minutes without trusting a client value.
 */
export function transcriptDurationSec(
  segments: { offset: number; duration?: number }[],
): number {
  let maxMs = 0;
  for (const s of segments) {
    const end = s.offset + (s.duration ?? 0); // offsets/durations are in ms
    if (end > maxMs) maxMs = end;
  }
  return Math.ceil(maxMs / 1000);
}

/** New marker every ~15s window so the AI can cite moments without spam. */
const MARKER_WINDOW_SEC = 15;

/** Format a second offset as `MM:SS` (minutes can exceed 59 for long videos). */
function formatTimestamp(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * Join transcript segments into one string with inline `[MM:SS]` markers so
 * downstream AI can quote a moment. One marker is emitted per ~15s window
 * (derived from each segment's `offset` in ms), not per segment — adjacent
 * sub-second captions collapse under the same marker to avoid marker spam.
 * Markers are monotonic because segments arrive in playback order.
 */
function assembleTimestampedTranscript(
  segments: { text: string; offset: number }[],
): string {
  const parts: string[] = [];
  // Sentinel forces the first segment to open a window and emit a marker.
  let lastWindow = -1;
  for (const seg of segments) {
    const seconds = Math.max(0, Math.floor(seg.offset / 1000));
    const windowIndex = Math.floor(seconds / MARKER_WINDOW_SEC);
    if (windowIndex !== lastWindow) {
      parts.push(`[${formatTimestamp(seconds)}]`);
      lastWindow = windowIndex;
    }
    parts.push(seg.text);
  }
  return parts.join(' ');
}
