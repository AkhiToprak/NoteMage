import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { extractYouTubeTranscript } from '@/lib/youtube';
import {
  successResponse,
  badRequestResponse,
  unauthorizedResponse,
  notFoundResponse,
  internalErrorResponse,
} from '@/lib/api-response';

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

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

    const { title, transcript } = await extractYouTubeTranscript(url);

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

    return successResponse({ document });
  } catch {
    return internalErrorResponse();
  }
}
