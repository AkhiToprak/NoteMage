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

    const image = await db.pageImage.findFirst({
      where: {
        id: imageId,
        page: {
          section: {
            notebook: { userId },
          },
        },
      },
    });

    if (!image) return notFoundResponse('Image not found');

    const buffer = await readFile(image.filePath);

    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': image.mimeType,
        'Cache-Control': 'public, max-age=31536000',
      },
    });
  } catch {
    return internalErrorResponse();
  }
}
