import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { downloadFromStorage, validateStoragePath } from '@/lib/storage';
import {
  createdResponse,
  badRequestResponse,
  unauthorizedResponse,
  notFoundResponse,
  internalErrorResponse,
} from '@/lib/api-response';

type Params = { params: Promise<{ id: string; pageId: string }> };

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

function mimeFromExtension(fileName: string): string | null {
  const ext = fileName.split('.').pop()?.toLowerCase();
  const map: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
  };
  return ext ? (map[ext] ?? null) : null;
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: notebookId, pageId } = await params;

    // Verify page ownership
    const page = await db.page.findFirst({
      where: {
        id: pageId,
        section: {
          notebookId,
          notebook: { userId },
        },
      },
    });

    if (!page) return notFoundResponse('Page not found');

    const { storagePath, fileName } = await request.json();

    if (!storagePath || !validateStoragePath(storagePath, 'images/')) {
      return badRequestResponse('Invalid or missing storagePath');
    }

    const contentType = mimeFromExtension(fileName || '');
    if (!contentType || !ALLOWED_TYPES.includes(contentType)) {
      return badRequestResponse('Invalid file type. Allowed: PNG, JPEG, GIF, WebP');
    }

    // Download from storage for size tracking / validation
    const buffer = await downloadFromStorage(storagePath);

    const image = await db.pageImage.create({
      data: {
        pageId,
        fileName: fileName || 'image',
        filePath: storagePath,
        fileSize: buffer.length,
        mimeType: contentType,
      },
    });

    return createdResponse({
      id: image.id,
      fileName: image.fileName,
      fileSize: image.fileSize,
      mimeType: image.mimeType,
      url: `/api/uploads/images/${image.id}`,
      createdAt: image.createdAt,
    });
  } catch {
    return internalErrorResponse();
  }
}
