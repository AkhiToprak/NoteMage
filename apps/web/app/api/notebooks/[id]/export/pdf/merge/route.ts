import { NextRequest } from 'next/server';
import { PDFDocument } from 'pdf-lib';
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
    const { pageIds } = body as { pageIds: string[] };

    if (!pageIds || pageIds.length === 0) {
      return new Response(JSON.stringify({ error: 'pageIds required' }), {
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

    // Generate individual PDFs and merge with pdf-lib
    const mergedPdf = await PDFDocument.create();

    for (const page of orderedPages) {
      const pdfBytes = await generatePagesPdf(notebook.name, [
        { title: page.title, textContent: page.textContent || '' },
      ]);
      const sourcePdf = await PDFDocument.load(pdfBytes);
      const copiedPages = await mergedPdf.copyPages(sourcePdf, sourcePdf.getPageIndices());
      copiedPages.forEach((p) => mergedPdf.addPage(p));
    }

    const mergedBytes = await mergedPdf.save();
    const filename = `${notebook.name.replace(/[^a-zA-Z0-9]/g, '_')}_merged.pdf`;

    return new Response(new Uint8Array(mergedBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('PDF merge error:', error);
    return internalErrorResponse();
  }
}
