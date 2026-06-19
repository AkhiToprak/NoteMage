import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  createdResponse,
  badRequestResponse,
  unauthorizedResponse,
  notFoundResponse,
  internalErrorResponse,
  tooManyRequestsResponse,
} from '@/lib/api-response';
import { parsePptxFile } from '@/lib/pptx-parser';
import { textToTipTapJSON } from '@/lib/contentConverter';
import { saveImage, downloadFromStorage, validateStoragePath, deleteFile } from '@/lib/storage';
import { rateLimit, rateLimitKey } from '@/lib/rate-limit';

type Params = { params: Promise<{ id: string; sectionId: string }> };

// Hard byte cap enforced before parsing — guards against zip-bomb /
// decompression DoS on the uploaded PPTX.
const MAX_PPTX_BYTES = 25 * 1024 * 1024;

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const rl = await rateLimit(rateLimitKey('file-import', request, userId), 10, 60_000);
    if (!rl.success) {
      return tooManyRequestsResponse(
        'Too many import requests. Please try again later.',
        rl.retryAfterMs
      );
    }

    const { id: notebookId, sectionId } = await params;

    // Verify notebook ownership
    const notebook = await db.notebook.findFirst({
      where: { id: notebookId, userId },
    });
    if (!notebook) return notFoundResponse('Notebook not found');

    // Verify section belongs to this notebook
    const section = await db.section.findFirst({
      where: { id: sectionId, notebookId },
    });
    if (!section) return notFoundResponse('Section not found in this notebook');

    // Parse JSON body with storage path
    const { storagePath } = await request.json();
    if (!storagePath || !validateStoragePath(storagePath, `temp-imports/${userId}/`)) {
      return badRequestResponse('Invalid or missing storagePath');
    }

    const buffer = await downloadFromStorage(storagePath);

    // Hard byte cap BEFORE parsing — guards against zip-bomb / decompression DoS.
    if (buffer.length > MAX_PPTX_BYTES) {
      await deleteFile(storagePath).catch(() => {});
      return badRequestResponse(
        `File is too large. Maximum is ${Math.floor(MAX_PPTX_BYTES / (1024 * 1024))}MB.`
      );
    }

    const slides = await parsePptxFile(buffer);

    if (slides.length === 0) {
      return badRequestResponse('No slides found in the PPTX file');
    }

    const createdPages = [];

    for (const slide of slides) {
      // Determine sort order
      const maxOrder = await db.page.aggregate({
        where: { sectionId },
        _max: { sortOrder: true },
      });
      const sortOrder = (maxOrder._max.sortOrder ?? -1) + 1;

      // Convert slide text to TipTap JSON
      const content = textToTipTapJSON(slide.textContent) as unknown as Prisma.InputJsonValue;

      // Create the page
      const page = await db.page.create({
        data: {
          sectionId,
          title: slide.title || `Slide ${slide.slideNumber}`,
          content,
          textContent: slide.textContent,
          sortOrder,
          sourceDocId: null,
        },
      });

      // Save images and create PageImage records
      for (const image of slide.images) {
        const { filePath } = await saveImage(page.id, image.fileName, image.buffer);

        await db.pageImage.create({
          data: {
            pageId: page.id,
            fileName: image.fileName,
            filePath,
            fileSize: image.buffer.length,
            mimeType: image.mimeType,
            sourceType: 'pptx',
          },
        });
      }

      createdPages.push(page);
    }

    // Clean up temp file from storage
    await deleteFile(storagePath).catch(() => {});

    return createdResponse(createdPages);
  } catch (error) {
    console.error('PPTX import error:', error);
    return internalErrorResponse();
  }
}
