import { NextRequest } from 'next/server';
import { getAdminUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { sanitizeCaption } from '@/lib/image-captions';
import { successResponse, forbiddenResponse, internalErrorResponse } from '@/lib/api-response';

// GET — imported PDF/image assets debug view (admin only). One row per
// PageImage, joined with its document/page + computed pipeline status
// (sanitize pass, catalog eligibility, figure-reuse) so the figure-reuse
// pipeline can be inspected without re-running a generation.

const PAGE_SIZE = 50;

/** Best-effort PDF page number from a crop's fileName (e.g. "p3-fig1.png"). */
function pageNumberFromFileName(fileName: string): number | null {
  const m = /^p(\d+)/i.exec(fileName);
  return m ? Number(m[1]) : null;
}

export async function GET(request: NextRequest) {
  try {
    const adminId = await getAdminUserId(request);
    if (!adminId) return forbiddenResponse('Admin access required');

    const url = new URL(request.url);
    const page = Math.max(1, Number(url.searchParams.get('page') ?? '1') || 1);
    const sourceType = url.searchParams.get('sourceType') || undefined;
    const q = (url.searchParams.get('q') || '').trim();

    const where = {
      mimeType: { startsWith: 'image/' },
      // 'unknown' is the UI label for historical rows with no recorded source
      // (sourceType IS NULL), so filter on null rather than the literal string.
      ...(sourceType ? { sourceType: sourceType === 'unknown' ? null : sourceType } : {}),
      ...(q
        ? {
            page: {
              is: { title: { contains: q, mode: 'insensitive' as const } },
            },
          }
        : {}),
    };

    const [total, rows, sourceTypeGroups] = await Promise.all([
      db.pageImage.count({ where }),
      db.pageImage.findMany({
        where,
        select: {
          id: true,
          fileName: true,
          fileSize: true,
          mimeType: true,
          bbox: true,
          sourceType: true,
          aiCaption: true,
          captionedAt: true,
          createdAt: true,
          page: {
            select: {
              id: true,
              title: true,
              section: { select: { notebook: { select: { user: { select: { email: true } } } } } },
            },
          },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      // Distinct source types for the filter chips.
      db.pageImage.groupBy({ by: ['sourceType'], _count: { _all: true } }),
    ]);

    const imageIds = rows.map((r) => r.id);
    const pageIds = Array.from(new Set(rows.map((r) => r.page.id)));

    // Reuse flags + document names resolved in bulk (no N+1).
    const [theoryReuse, flashcardReuse, quizReuse, importJobs] = await Promise.all([
      db.theoryImage.findMany({
        where: { sourcePageImageId: { in: imageIds } },
        select: { sourcePageImageId: true },
      }),
      db.flashcardImage.findMany({
        where: { sourcePageImageId: { in: imageIds } },
        select: { sourcePageImageId: true },
      }),
      db.quizQuestionImage.findMany({
        where: { sourcePageImageId: { in: imageIds } },
        select: { sourcePageImageId: true },
      }),
      db.importJob.findMany({
        where: { resultPageId: { in: pageIds } },
        select: { resultPageId: true, fileName: true },
      }),
    ]);

    const theorySet = new Set(theoryReuse.map((r) => r.sourcePageImageId));
    const flashcardSet = new Set(flashcardReuse.map((r) => r.sourcePageImageId));
    const quizSet = new Set(quizReuse.map((r) => r.sourcePageImageId));
    const docByPage = new Map(importJobs.map((j) => [j.resultPageId, j.fileName]));

    const items = rows.map((r) => {
      const passedSanitize = sanitizeCaption(r.aiCaption) !== null;
      return {
        id: r.id,
        documentName: docByPage.get(r.page.id) ?? null,
        pageTitle: r.page.title,
        pageNumber: pageNumberFromFileName(r.fileName),
        ownerEmail: r.page.section.notebook.user.email,
        fileName: r.fileName,
        fileSize: r.fileSize,
        mimeType: r.mimeType,
        bbox: r.bbox,
        sourceType: r.sourceType,
        caption: r.aiCaption,
        captioned: r.captionedAt != null || !!r.aiCaption,
        passedSanitize,
        // renderImageCatalog only emits images with a non-empty caption.
        inCatalog: !!(r.aiCaption && r.aiCaption.trim().length > 0),
        reusedIn: {
          theory: theorySet.has(r.id),
          flashcard: flashcardSet.has(r.id),
          quiz: quizSet.has(r.id),
        },
        createdAt: r.createdAt,
      };
    });

    const sourceTypes = sourceTypeGroups
      .map((g) => ({ value: g.sourceType ?? 'unknown', count: g._count._all }))
      .sort((a, b) => b.count - a.count);

    return successResponse({
      items,
      total,
      page,
      pageSize: PAGE_SIZE,
      totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      sourceTypes,
    });
  } catch {
    return internalErrorResponse();
  }
}
