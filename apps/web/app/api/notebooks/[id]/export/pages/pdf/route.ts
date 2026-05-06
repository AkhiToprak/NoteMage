import { NextRequest } from 'next/server';
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
    const { pageIds, sectionId } = body as { pageIds?: string[]; sectionId?: string };

    let pages;
    if (pageIds && pageIds.length > 0) {
      pages = await db.page.findMany({
        where: { id: { in: pageIds }, section: { notebookId } },
        orderBy: { sortOrder: 'asc' },
        select: { title: true, textContent: true },
      });
    } else if (sectionId) {
      pages = await db.page.findMany({
        where: { sectionId, section: { notebookId } },
        orderBy: { sortOrder: 'asc' },
        select: { title: true, textContent: true },
      });
    } else {
      return new Response(JSON.stringify({ error: 'pageIds or sectionId required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (pages.length === 0) return notFoundResponse('No pages found');

    const pagesData = pages.map((p) => ({
      title: p.title,
      textContent: p.textContent || '',
    }));

    const buffer = await generatePagesPdf(notebook.name, pagesData);
    const filename = `${notebook.name.replace(/[^a-zA-Z0-9]/g, '_')}_pages.pdf`;

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Pages PDF export error:', error);
    return internalErrorResponse();
  }
}
