import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { extractYouTubeTranscript, CaptionsUnavailableError, VideoUnavailableError } from '@/lib/youtube';
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

    const usage = await checkUsageLimit(userId, 'youtube_transcript');
    if (!usage.allowed) {
      return tooManyRequestsResponse(
        usage.limit === -1
          ? 'Too many transcript requests.'
          : 'You have reached your video transcript limit.',
      );
    }

    let title: string;
    let transcript: string;
    try {
      ({ title, transcript } = await extractYouTubeTranscript(url));
    } catch (err) {
      if (err instanceof VideoUnavailableError) {
        return badRequestResponse("Couldn't read this video.");
      }
      if (err instanceof CaptionsUnavailableError) {
        return unprocessableEntityResponse('No captions found.');
      }
      throw err;
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

    await incrementUsage(userId, 'youtube_transcript');

    return createdResponse({ document });
  } catch {
    return internalErrorResponse();
  }
}
