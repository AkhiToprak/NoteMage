import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { readFile } from '@/lib/storage';
import { unauthorizedResponse, notFoundResponse, internalErrorResponse } from '@/lib/api-response';

type Params = { params: Promise<{ imageId: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { imageId } = await params;

    const image = await db.sharedNotebookImage.findUnique({
      where: { id: imageId },
      include: {
        sharedNotebook: {
          select: { sharedById: true, sharedWithId: true, visibility: true },
        },
      },
    });

    if (!image) return notFoundResponse('Image not found');

    // The image is only as visible as its parent share. The Supabase client
    // uses the service-role key, so this app-layer gate is the only barrier:
    // mirror the SharedNotebook access model used by the community feed.
    const share = image.sharedNotebook;
    const isOwner = share.sharedById === userId;
    let allowed = isOwner;

    if (!allowed) {
      if (share.visibility === 'public') {
        allowed = true;
      } else if (share.visibility === 'specific') {
        allowed = share.sharedWithId === userId;
      } else if (share.visibility === 'friends') {
        const friendship = await db.friendship.findFirst({
          where: {
            status: 'accepted',
            OR: [
              { requesterId: userId, addresseeId: share.sharedById },
              { requesterId: share.sharedById, addresseeId: userId },
            ],
          },
          select: { id: true },
        });
        allowed = Boolean(friendship);
      }
    }

    // Don't disclose existence of a private image to unauthorized callers.
    if (!allowed) return notFoundResponse('Image not found');

    const buffer = await readFile(image.filePath);

    // Public shares may be cached by shared caches; everything else is
    // per-user and must never land in a shared/CDN cache.
    const cacheControl =
      share.visibility === 'public'
        ? 'public, max-age=31536000'
        : 'private, max-age=31536000';

    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': image.mimeType,
        'Cache-Control': cacheControl,
      },
    });
  } catch {
    return internalErrorResponse();
  }
}
