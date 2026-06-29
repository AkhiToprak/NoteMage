// Source-highlighting feature — pure helpers shared by the video pane + resolver.

import { describe, it, expect } from 'vitest';
import { parseYouTubeId, youtubeEmbedUrl, formatTimestamp } from './source-anchor';

describe('parseYouTubeId', () => {
  it('parses watch URLs', () => {
    expect(parseYouTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(parseYouTubeId('https://youtube.com/watch?list=PL123&v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });
  it('parses short, embed, shorts, and live URLs', () => {
    expect(parseYouTubeId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(parseYouTubeId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(parseYouTubeId('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(parseYouTubeId('https://www.youtube.com/live/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });
  it('returns null for non-YouTube / empty', () => {
    expect(parseYouTubeId('https://vimeo.com/12345')).toBeNull();
    expect(parseYouTubeId(null)).toBeNull();
    expect(parseYouTubeId('')).toBeNull();
  });
});

describe('youtubeEmbedUrl', () => {
  it('builds a nocookie embed seeked to the start second', () => {
    expect(youtubeEmbedUrl('https://youtu.be/dQw4w9WgXcQ', 165)).toBe(
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=165',
    );
  });
  it('omits start when no/zero timestamp', () => {
    expect(youtubeEmbedUrl('https://youtu.be/dQw4w9WgXcQ')).toBe(
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    );
    expect(youtubeEmbedUrl('https://youtu.be/dQw4w9WgXcQ', 0)).toBe(
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    );
  });
  it('returns null when the URL is not YouTube', () => {
    expect(youtubeEmbedUrl('https://example.com/video.mp4', 10)).toBeNull();
  });
});

describe('formatTimestamp', () => {
  it('formats under and over an hour', () => {
    expect(formatTimestamp(0)).toBe('0:00');
    expect(formatTimestamp(5)).toBe('0:05');
    expect(formatTimestamp(165)).toBe('2:45');
    expect(formatTimestamp(3661)).toBe('1:01:01');
  });
});
