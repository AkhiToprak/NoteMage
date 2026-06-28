import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  extractYouTubeTranscript,
  transcriptDurationSec,
  CaptionsUnavailableError,
  VideoUnavailableError,
} from '@/lib/youtube';
import { minutesForDuration } from '@/lib/video-import/submit';
import { YOUTUBE_TRANSCRIPT_MAX_DURATION_SEC } from '@/lib/youtube-transcript-limits';
import { getOrCreateInboxNotebook } from '@/lib/inbox';
import { checkUsageLimit, incrementUsage } from '@/lib/usage-limits';
import { rateLimit, rateLimitKey } from '@/lib/rate-limit';
import {
  createdResponse,
  badRequestResponse,
  unauthorizedResponse,
  tooManyRequestsResponse,
  unprocessableEntityResponse,
  internalErrorResponse,
} from '@/lib/api-response';

/**
 * POST /api/learn/documents/youtube — notebook-optional YouTube ingest for the
 * path-create flow, where there may be no notebook yet. Resolves (or creates)
 * the caller's Inbox notebook the way `/api/learn/uploads` does, then stores
 * the transcript Document there. Same gate / meter / rate-limit as the
 * notebook-scoped route. Returns the created Document id so the path material
 * picker can add it to `materialIds`.
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const limit = await rateLimit(rateLimitKey('youtube-transcript', request, userId), 10, 60_000);
    if (!limit.success) {
      return tooManyRequestsResponse(
        'Too many transcript requests. Please wait a moment and try again.',
        limit.retryAfterMs,
      );
    }

    const body = await request.json().catch(() => ({}));
    const { url } = body;

    if (!url || typeof url !== 'string') {
      return badRequestResponse('URL is required');
    }

    if (!/youtube\.com|youtu\.be/.test(url)) {
      return badRequestResponse('Invalid YouTube URL');
    }

    // `youtube_transcript` is metered in MINUTES of video. Reject anyone already
    // out of balance; the exact minutes charge happens after we read the length.
    const usage = await checkUsageLimit(userId, 'youtube_transcript');
    if (!usage.allowed) {
      return tooManyRequestsResponse(
        usage.limit === -1
          ? 'Too many transcript requests.'
          : 'You have reached your video minutes limit.',
      );
    }

    let title: string;
    let transcript: string;
    let segments: { offset: number; duration?: number }[];
    try {
      ({ title, transcript, segments } = await extractYouTubeTranscript(url));
    } catch (err) {
      if (err instanceof VideoUnavailableError) {
        return badRequestResponse("Couldn't read this video.");
      }
      if (err instanceof CaptionsUnavailableError) {
        return unprocessableEntityResponse('No captions found.');
      }
      throw err;
    }

    // Length from the captions we just pulled — trustworthy, no client value.
    const durationSec = transcriptDurationSec(segments);
    if (durationSec > YOUTUBE_TRANSCRIPT_MAX_DURATION_SEC) {
      const maxMin = Math.floor(YOUTUBE_TRANSCRIPT_MAX_DURATION_SEC / 60);
      return badRequestResponse(`This video is too long — ${maxMin} minutes max.`);
    }
    const minutes = minutesForDuration(durationSec);
    if (usage.limit !== -1 && minutes > usage.limit - usage.used) {
      const remaining = Math.max(0, usage.limit - usage.used);
      return tooManyRequestsResponse(`Not enough video minutes left (${remaining} remaining).`);
    }

    const inbox = await getOrCreateInboxNotebook(userId);

    const document = await db.document.create({
      data: {
        notebookId: inbox.id,
        fileName: `YouTube: ${title}`,
        filePath: url,
        fileType: 'text/youtube-transcript',
        textContent: transcript,
        fileSize: Buffer.byteLength(transcript, 'utf-8'),
      },
    });

    await incrementUsage(userId, 'youtube_transcript', minutes);

    return createdResponse({ document });
  } catch (err) {
    console.error('[youtube-transcript]', err);
    return internalErrorResponse();
  }
}
