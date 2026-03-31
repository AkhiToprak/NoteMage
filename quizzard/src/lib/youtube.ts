import { YoutubeTranscript } from 'youtube-transcript';

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
