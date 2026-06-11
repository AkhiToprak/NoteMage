import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { readFile } from '@/lib/storage';
import { unauthorizedResponse, notFoundResponse, internalErrorResponse } from '@/lib/api-response';

// Serves a quiz question's exhibit image (figure-reuse feature, P4). The blob is
// a path-owned snapshot (copied at generation time), so access is owner-only:
// the requester must own the QuizSet that transitively owns this image
// (image → question → set → user). Mirrors /api/uploads/flashcard-images.

type Params = { params: Promise<{ imageId: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { imageId } = await params;

    const image = await db.quizQuestionImage.findFirst({
      where: {
        id: imageId,
        question: {
          quizSet: { userId },
        },
      },
    });

    if (!image) return notFoundResponse('Image not found');

    const buffer = await readFile(image.filePath);

    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': image.mimeType,
        'Cache-Control': 'private, max-age=31536000, immutable',
      },
    });
  } catch {
    return internalErrorResponse();
  }
}
