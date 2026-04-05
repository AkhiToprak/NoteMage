import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { downloadFromStorage, validateStoragePath } from '@/lib/storage';
import {
  createdResponse,
  badRequestResponse,
  unauthorizedResponse,
  notFoundResponse,
  forbiddenResponse,
  internalErrorResponse,
} from '@/lib/api-response';

type Params = { params: Promise<{ shareId: string }> };

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const MAX_IMAGES = 10;

function mimeFromExtension(fileName: string): string | null {
  const ext = fileName.split('.').pop()?.toLowerCase();
  const map: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
  };
  return ext ? map[ext] ?? null : null;
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { shareId } = await params;

    const share = await db.sharedNotebook.findUnique({
      where: { id: shareId },
      include: { _count: { select: { images: true } } },
    });

    if (!share) return notFoundResponse('Shared notebook not found');
    if (share.sharedById !== userId) return forbiddenResponse('You do not own this share');

    if (share._count.images >= MAX_IMAGES) {
      return badRequestResponse(`Maximum ${MAX_IMAGES} images allowed`);
    }

    const { storagePath, fileName, isCover } = await request.json();

    if (!storagePath || !validateStoragePath(storagePath, 'images/shared-')) {
      return badRequestResponse('Invalid or missing storagePath');
    }

    const contentType = mimeFromExtension(fileName || '');
    if (!contentType || !ALLOWED_TYPES.includes(contentType)) {
      return badRequestResponse('Invalid file type. Allowed: PNG, JPEG, GIF, WebP');
    }

    // Download from storage for size tracking / validation
    const buffer = await downloadFromStorage(storagePath);

    const image = await db.sharedNotebookImage.create({
      data: {
        sharedNotebookId: shareId,
        fileName: fileName || 'image',
        filePath: storagePath,
        fileSize: buffer.length,
        mimeType: contentType,
        sortOrder: share._count.images,
      },
    });

    const imageUrl = `/api/uploads/shared-images/${image.id}`;

    // If this is a cover image, set it on the shared notebook
    if (isCover === true) {
      await db.sharedNotebook.update({
        where: { id: shareId },
        data: { coverImageUrl: imageUrl },
      });
    }

    return createdResponse({
      id: image.id,
      fileName: image.fileName,
      fileSize: image.fileSize,
      mimeType: image.mimeType,
      url: imageUrl,
      sortOrder: image.sortOrder,
    });
  } catch {
    return internalErrorResponse();
  }
}
