import { YoutubeTranscript } from 'youtube-transcript';

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

  // Fetch transcript segments
  const rawSegments = await YoutubeTranscript.fetchTranscript(videoId);

  const segments = rawSegments.map((segment) => ({
    text: segment.text,
    offset: segment.offset,
    duration: segment.duration,
  }));

  const transcript = segments.map((s) => s.text).join(' ');

  return {
    title,
    videoId,
    transcript,
    segments,
  };
}
