import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { readFile } from '@/lib/storage';
import { unauthorizedResponse, notFoundResponse, internalErrorResponse } from '@/lib/api-response';

// Serves a path theory's embedded image (theory-visuals feature). The TipTap
// `pathImage` node carries only a `ref` (the TheoryImage.sortOrder), so the
// URL is `/api/path-images/<theoryId>/<ref>`. Access is owner-only: the
// requester must own the StudyPlan that transitively owns this TheoryImage
// (theory → activity → slot → phase → plan). Community viewers never read
// theory bodies before cloning, and a clone owns its own copied TheoryImage
// rows — so the owner check is the whole access model.

type Params = { params: Promise<{ theoryId: string; ref: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { theoryId, ref } = await params;
    const sortOrder = Number.parseInt(ref, 10);
    if (!Number.isInteger(sortOrder) || sortOrder < 0) {
      return notFoundResponse('Image not found');
    }

    const image = await db.theoryImage.findFirst({
      where: {
        theoryId,
        sortOrder,
        theory: { activity: { slot: { phase: { plan: { userId } } } } },
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
