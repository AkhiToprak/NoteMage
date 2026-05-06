import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  successResponse,
  badRequestResponse,
  unauthorizedResponse,
  notFoundResponse,
  internalErrorResponse,
} from '@/lib/api-response';
import { extractText } from '@/lib/fileProcessing';
import { extractPdfTipTapNodes } from '@/lib/pdfjs-node';
import { downloadFromStorage, validateStoragePath, deleteFile, saveImage } from '@/lib/storage';

type Params = { params: Promise<{ id: string; pageId: string }> };

/**
 * Appends the contents of a PDF (text + embedded images) to the end
 * of an existing text page's TipTap document. Images are saved as
 * pageImage records and embedded as resizableImage nodes at the tail
 * of the document, after the extracted text.
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: notebookId, pageId } = await params;

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
    if (page.pageType !== 'text') {
      return badRequestResponse('PDF append is only supported on text pages');
    }

    const { storagePath, fileType } = await request.json();

    if (!storagePath) return badRequestResponse('No storagePath provided');
    if (!validateStoragePath(storagePath, 'temp-imports/')) {
      return badRequestResponse('Invalid storage path');
    }
    if (fileType !== 'application/pdf') {
      return badRequestResponse('Only PDF files can be appended');
    }

    const buffer = await downloadFromStorage(storagePath);

    const extractedNodes = await extractPdfTipTapNodes(buffer);
    const text = await extractText(buffer, 'application/pdf');

    // Extract + persist embedded images, build image nodes to embed
    const imageNodes: Array<Record<string, unknown>> = [];
    try {
      const { extractPdfImages } = await import('@/lib/pdf-image-extractor');
      const extractedImages = await extractPdfImages(buffer);
      for (const img of extractedImages) {
        const { filePath } = await saveImage(page.id, img.fileName, img.buffer);
        const pageImage = await db.pageImage.create({
          data: {
            pageId: page.id,
            fileName: img.fileName,
            filePath,
            fileSize: img.buffer.length,
            mimeType: img.mimeType,
          },
        });
        imageNodes.push({
          type: 'resizableImage',
          attrs: {
            src: `/api/uploads/images/${pageImage.id}`,
            alt: img.fileName,
            width: null,
          },
        });
      }
    } catch (imageError) {
      console.error('PDF image extraction error:', imageError);
    }

    const appendedNodes = [...extractedNodes, ...imageNodes];

    // Merge into existing content for textContent bookkeeping; client is
    // responsible for actually inserting into its live editor via the
    // returned nodes (so undo/redo and cursor position behave naturally).
    const existingText = page.textContent ?? '';
    const joiner = existingText && text ? '\n\n' : '';
    const newTextContent = `${existingText}${joiner}${text}`.slice(0, 500_000);

    await db.page.update({
      where: { id: pageId },
      data: { textContent: newTextContent },
    });

    await deleteFile(storagePath).catch(() => {});

    return successResponse({ nodes: appendedNodes });
  } catch (error) {
    console.error('PDF append error:', error);
    return internalErrorResponse();
  }
}
