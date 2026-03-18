import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { saveImage } from '@/lib/storage';
import {
  createdResponse,
  badRequestResponse,
  unauthorizedResponse,
  notFoundResponse,
  internalErrorResponse,
} from '@/lib/api-response';

type Params = { params: Promise<{ id: string; pageId: string }> };

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

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

    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return badRequestResponse('No file provided');
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return badRequestResponse('Invalid file type. Allowed: PNG, JPEG, GIF, WebP');
    }

    if (file.size > MAX_SIZE) {
      return badRequestResponse('File too large. Maximum size is 5MB');
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const { filePath } = await saveImage(pageId, file.name, buffer);

    const image = await db.pageImage.create({
      data: {
        pageId,
        fileName: file.name,
        filePath,
        fileSize: file.size,
        mimeType: file.type,
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
