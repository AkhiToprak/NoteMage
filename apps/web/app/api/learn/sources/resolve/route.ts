import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { getSignedReadUrl } from '@/lib/storage';
import {
  successResponse,
  unauthorizedResponse,
  internalErrorResponse,
} from '@/lib/api-response';
import type { ResolveResult } from '@/lib/source-anchor';

// Source-highlighting feature — resolve one content anchor to a renderable,
// viewer-agnostic payload. The client passes the denormalized anchor it already
// holds (materialId/kind/page/timestampSec/quote from a theory/flashcard/quiz
// row); the server ownership-checks the origin material and returns a signed PDF
// URL / video URL / extracted text so the viewer can open + highlight it.
//
// Always 200: an anchor with no openable origin (legacy, general-knowledge, or a
// since-deleted material) returns `{ resolvable: false }` so the client falls
// back to the quote-only drawer rather than erroring.

const UNRESOLVABLE = { resolvable: false } as const;

function isPdf(fileType: string | null | undefined): boolean {
  return !!fileType && fileType.toLowerCase().includes('pdf');
}

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const sp = request.nextUrl.searchParams;
    const materialId = sp.get('materialId')?.trim() || '';
    const kind = sp.get('kind')?.trim() || '';
    const quote = sp.get('quote')?.trim() || '';
    const pageRaw = sp.get('page');
    const tsRaw = sp.get('timestampSec');
    const page = pageRaw != null && /^\d+$/.test(pageRaw) ? parseInt(pageRaw, 10) : undefined;
    const timestampSec = tsRaw != null && /^\d+$/.test(tsRaw) ? parseInt(tsRaw, 10) : undefined;

    // No stable origin → nothing to open. quote-only drawer handles it client-side.
    if (!materialId || (kind !== 'page' && kind !== 'document')) {
      return successResponse<ResolveResult>(UNRESOLVABLE);
    }

    if (kind === 'document') {
      const doc = await db.document.findFirst({
        where: { id: materialId, notebook: { userId } },
        select: { fileName: true, filePath: true, fileType: true, textContent: true },
      });
      if (!doc) return successResponse<ResolveResult>(UNRESOLVABLE);

      if (isPdf(doc.fileType) && doc.filePath) {
        const fileUrl = await getSignedReadUrl(doc.filePath).catch(() => null);
        if (fileUrl) {
          return successResponse<ResolveResult>({
            resolvable: true,
            sourceType: 'pdf',
            title: doc.fileName,
            quote,
            ...(page != null ? { page } : {}),
            fileUrl,
          });
        }
      }
      // Non-PDF document, or signing failed → fall back to extracted text.
      return successResponse<ResolveResult>({
        resolvable: true,
        sourceType: 'text',
        title: doc.fileName,
        quote,
        ...(doc.textContent ? { textContent: doc.textContent } : {}),
      });
    }

    // kind === 'page'
    const pageRow = await db.page.findFirst({
      where: { id: materialId, section: { notebook: { userId } } },
      select: {
        title: true,
        textContent: true,
        sourceDocId: true,
        sourceDocPage: true,
        sourceVideoUrl: true,
        sourceMediaType: true,
      },
    });
    if (!pageRow) return successResponse<ResolveResult>(UNRESOLVABLE);

    // Video-derived page → seekable embed (+ transcript for the highlight pane).
    if (pageRow.sourceVideoUrl || pageRow.sourceMediaType) {
      return successResponse<ResolveResult>({
        resolvable: true,
        sourceType: 'video',
        title: pageRow.title,
        quote,
        ...(timestampSec != null ? { timestampSec } : {}),
        ...(pageRow.sourceVideoUrl ? { videoUrl: pageRow.sourceVideoUrl } : {}),
        ...(pageRow.sourceMediaType === 'youtube' || pageRow.sourceMediaType === 'upload'
          ? { mediaType: pageRow.sourceMediaType }
          : {}),
        ...(pageRow.textContent ? { textContent: pageRow.textContent } : {}),
      });
    }

    // PDF-imported page → resolve through to the parent document's original file.
    if (pageRow.sourceDocId) {
      const doc = await db.document.findFirst({
        where: { id: pageRow.sourceDocId, notebook: { userId } },
        select: { fileName: true, filePath: true, fileType: true },
      });
      if (doc && isPdf(doc.fileType) && doc.filePath) {
        const fileUrl = await getSignedReadUrl(doc.filePath).catch(() => null);
        if (fileUrl) {
          const resolvedPage = page ?? pageRow.sourceDocPage ?? undefined;
          return successResponse<ResolveResult>({
            resolvable: true,
            sourceType: 'pdf',
            title: doc.fileName || pageRow.title,
            quote,
            ...(resolvedPage != null ? { page: resolvedPage } : {}),
            fileUrl,
          });
        }
      }
    }

    // Plain text/imported page → extracted-text pane.
    return successResponse<ResolveResult>({
      resolvable: true,
      sourceType: 'text',
      title: pageRow.title,
      quote,
      ...(pageRow.textContent ? { textContent: pageRow.textContent } : {}),
    });
  } catch (error) {
    console.error('[learn/sources/resolve GET]', error);
    return internalErrorResponse();
  }
}
