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
import { checkUsageLimit, incrementUsage } from '@/lib/usage-limits';
import { rateLimit, rateLimitKey } from '@/lib/rate-limit';
import {
  successResponse,
  badRequestResponse,
  unauthorizedResponse,
  notFoundResponse,
  tooManyRequestsResponse,
  unprocessableEntityResponse,
  internalErrorResponse,
} from '@/lib/api-response';

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
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

    const { id: notebookId } = await params;

    const notebook = await db.notebook.findFirst({
      where: { id: notebookId, userId },
    });
    if (!notebook) return notFoundResponse('Notebook not found');

    const body = await request.json();
    const { url } = body;

    if (!url || typeof url !== 'string') {
      return badRequestResponse('URL is required');
    }

    if (!/youtube\.com|youtu\.be/.test(url)) {
      return badRequestResponse('Invalid YouTube URL');
    }

    // Budget gate — `youtube_transcript` is metered in MINUTES of video. First
    // reject anyone already out of balance; the exact minutes charge happens
    // after we know the video's length.
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

    const document = await db.document.create({
      data: {
        notebookId,
        fileName: `YouTube: ${title}`,
        filePath: url,
        fileType: 'text/youtube-transcript',
        textContent: transcript,
        fileSize: Buffer.byteLength(transcript, 'utf-8'),
      },
    });

    // Charge the video's minutes only after a successful create, so a failure
    // never bills the user and no refund path is needed.
    await incrementUsage(userId, 'youtube_transcript', minutes);

    return successResponse({ document });
  } catch {
    return internalErrorResponse();
  }
}
