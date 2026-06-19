import { NextRequest } from 'next/server';
import { getAdminUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { readFile } from '@/lib/storage';
import { forbiddenResponse, notFoundResponse, internalErrorResponse } from '@/lib/api-response';

// Admin-only image proxy for the /admin/pdf-assets debug view. Unlike the
// user-facing /api/uploads/images route, this serves ANY user's PageImage
// (admins inspect across accounts) — so it is guarded by getAdminUserId, never
// the per-user ownership chain.
type Params = { params: Promise<{ imageId: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const adminId = await getAdminUserId(request);
    if (!adminId) return forbiddenResponse('Admin access required');

    const { imageId } = await params;
    const image = await db.pageImage.findUnique({
      where: { id: imageId },
      select: { filePath: true, mimeType: true },
    });
    if (!image) return notFoundResponse('Image not found');

    const buffer = await readFile(image.filePath);
    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': image.mimeType,
        // Private to the admin's browser session, never a shared/CDN cache.
        'Cache-Control': 'private, max-age=300',
      },
    });
  } catch {
    return internalErrorResponse();
  }
}
