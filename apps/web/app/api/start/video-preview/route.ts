import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';
import { clientIpFromHeaders } from '@/lib/client-ip';

/**
 * Public, unauthenticated video-metadata preview for the pre-sign-up onboarding
 * link bridge (`/start/link`). Given a pasted YouTube URL it returns just enough
 * to render "here's the video I detected" — title, channel, thumbnail, and (only
 * when YOUTUBE_API_KEY is set) duration. It does NOT fetch the transcript, so it
 * touches no metered quota and needs no session — it's a cheap oEmbed lookup.
 *
 * Allowlisted as public in middleware (PUBLIC_API_ROUTES → /api/start). Only ever
 * calls fixed YouTube hosts with a validated 11-char video id, so there's no SSRF
 * surface from the user-supplied URL.
 */

export const runtime = 'nodejs';

// Minimal, dependency-free YouTube id parser (the richer one in src/lib/youtube.ts
// drags in the transcript lib — kept out of this hot public route on purpose).
function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?.*v=)([a-zA-Z0-9_-]{11})/,
    /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/live\/)([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

// ISO-8601 (PT#H#M#S) → "M:SS" / "MM:SS" (minutes may exceed 59 for long videos).
function isoDurationToClock(iso: string): string | null {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!m) return null;
  const total = (+(m[1] ?? 0)) * 3600 + (+(m[2] ?? 0)) * 60 + (+(m[3] ?? 0));
  if (total <= 0) return null;
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function fetchDuration(videoId: string): Promise<string | null> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return null;
  try {
    const res = await fetchWithTimeout(
      `https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${videoId}&key=${key}`,
      4000,
    );
    if (!res.ok) return null;
    const data = await res.json();
    const iso = data?.items?.[0]?.contentDetails?.duration as string | undefined;
    return iso ? isoDurationToClock(iso) : null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const ip = clientIpFromHeaders(
    request.headers.get('x-forwarded-for'),
    request.headers.get('x-real-ip'),
  );
  const { success } = await rateLimit(`start-video:${ip}`, 40, 60_000);
  if (!success) {
    return NextResponse.json({ ok: false, reason: 'rate_limited' }, { status: 429 });
  }

  const url = request.nextUrl.searchParams.get('url')?.trim() ?? '';
  if (!url) {
    return NextResponse.json({ ok: false, reason: 'invalid' }, { status: 400 });
  }

  const videoId = extractVideoId(url);
  if (!videoId) {
    // Not a YouTube link (the only provider the bridge supports today).
    return NextResponse.json({ ok: false, reason: 'unsupported' }, { status: 400 });
  }

  // oEmbed: public, key-less, gives title + channel + thumbnail. A private/
  // deleted video returns 401/404 here.
  let title: string | undefined;
  let channel: string | undefined;
  try {
    const oembed = await fetchWithTimeout(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(
        `https://www.youtube.com/watch?v=${videoId}`,
      )}&format=json`,
      5000,
    );
    if (!oembed.ok) {
      return NextResponse.json({ ok: false, reason: 'unavailable' }, { status: 404 });
    }
    const data = await oembed.json();
    title = typeof data?.title === 'string' ? data.title : undefined;
    channel = typeof data?.author_name === 'string' ? data.author_name : undefined;
  } catch {
    return NextResponse.json({ ok: false, reason: 'unavailable' }, { status: 502 });
  }

  const duration = await fetchDuration(videoId);

  return NextResponse.json(
    {
      ok: true,
      provider: 'youtube',
      videoId,
      title: title ?? 'Your video',
      channel: channel ?? 'YouTube',
      // hqdefault is always present for a public video; the card crops it 16:9.
      thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      duration, // null when YOUTUBE_API_KEY is unset — the card omits it
    },
    {
      // Video metadata is stable; let the CDN absorb repeat previews of a video.
      headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' },
    },
  );
}
