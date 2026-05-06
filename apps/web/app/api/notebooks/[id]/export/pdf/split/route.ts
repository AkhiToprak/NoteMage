import { NextRequest } from 'next/server';
import { PDFDocument } from 'pdf-lib';
import JSZip from 'jszip';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { unauthorizedResponse, notFoundResponse, internalErrorResponse } from '@/lib/api-response';
import { generatePagesPdf } from '@/lib/pdf-generator';

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: notebookId } = await params;

    const notebook = await db.notebook.findFirst({ where: { id: notebookId, userId } });
    if (!notebook) return notFoundResponse('Notebook not found');

    const body = await request.json();
    const { pageIds, splitAfter } = body as { pageIds: string[]; splitAfter: number[] };

    if (!pageIds || pageIds.length === 0) {
      return new Response(JSON.stringify({ error: 'pageIds required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (!splitAfter || splitAfter.length === 0) {
      return new Response(JSON.stringify({ error: 'splitAfter required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const pages = await db.page.findMany({
      where: { id: { in: pageIds }, section: { notebookId } },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, title: true, textContent: true },
    });

    if (pages.length === 0) return notFoundResponse('No pages found');

    // Preserve the order from pageIds
    const orderedPages = pageIds
      .map((pid) => pages.find((p) => p.id === pid))
      .filter(Boolean) as typeof pages;

    // Generate full PDF from all pages
    const pagesData = orderedPages.map((p) => ({
      title: p.title,
      textContent: p.textContent || '',
    }));
    const fullPdfBytes = await generatePagesPdf(notebook.name, pagesData);
    const fullPdf = await PDFDocument.load(fullPdfBytes);
    const totalPages = fullPdf.getPageCount();

    // Each notebook page produces pages in the PDF: title page + 1 page per notebook page
    // The title page is page 0, then each notebook page starts at index (1 + pageIndex)
    // But generatePagesPdf creates: title page (page 0) then each page on a new page
    // So notebook page i maps to PDF page (i + 1) for i > 0, and pages 0-1 for i === 0

    // Split the PDF at the specified split points
    // splitAfter contains indices into the orderedPages array where splits occur
    const sortedSplits = [...splitAfter].sort((a, b) => a - b);

    // Build ranges of page indices (0-based into orderedPages)
    const ranges: { start: number; end: number }[] = [];
    let rangeStart = 0;
    for (const splitIdx of sortedSplits) {
      if (splitIdx >= 0 && splitIdx < orderedPages.length - 1) {
        ranges.push({ start: rangeStart, end: splitIdx });
        rangeStart = splitIdx + 1;
      }
    }
    ranges.push({ start: rangeStart, end: orderedPages.length - 1 });

    // Generate separate PDFs for each range
    const zip = new JSZip();
    const safeTitle = notebook.name.replace(/[^a-zA-Z0-9]/g, '_');

    for (let i = 0; i < ranges.length; i++) {
      const range = ranges[i];
      const rangePages = orderedPages.slice(range.start, range.end + 1);
      const rangePagesData = rangePages.map((p) => ({
        title: p.title,
        textContent: p.textContent || '',
      }));

      const partBuffer = await generatePagesPdf(notebook.name, rangePagesData);
      zip.file(`${safeTitle}_part${i + 1}.pdf`, partBuffer);
    }

    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
    const filename = `${safeTitle}_split.zip`;

    return new Response(new Uint8Array(zipBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('PDF split error:', error);
    return internalErrorResponse();
  }
}
