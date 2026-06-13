import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  unauthorizedResponse,
  notFoundResponse,
  internalErrorResponse,
  badRequestResponse,
  tooManyRequestsResponse,
} from '@/lib/api-response';
import { rateLimit, rateLimitKey } from '@/lib/rate-limit';
import { generatePagesPptx } from '@/lib/pptx-generator';

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const limit = await rateLimit(rateLimitKey('export', request, userId), 10, 60_000);
    if (!limit.success) {
      return tooManyRequestsResponse('Too many export requests', limit.retryAfterMs);
    }

    const { id: notebookId } = await params;

    const notebook = await db.notebook.findFirst({ where: { id: notebookId, userId } });
    if (!notebook) return notFoundResponse('Notebook not found');

    const body = await request.json();
    const { pageIds, sectionId } = body as { pageIds?: string[]; sectionId?: string };

    if (pageIds && pageIds.length > 500) {
      return badRequestResponse('Too many pages (max 500)');
    }

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
    if (pages.length > 500) {
      return badRequestResponse('Too many pages (max 500)');
    }

    const pagesData = pages.map((p) => ({
      title: p.title,
      textContent: p.textContent || '',
    }));

    const totalContentLength = pagesData.reduce((sum, p) => sum + p.textContent.length, 0);
    if (totalContentLength > 10_000_000) {
      return badRequestResponse('Page content too large');
    }

    const buffer = await generatePagesPptx(notebook.name, pagesData);
    const filename = `${notebook.name.replace(/[^a-zA-Z0-9]/g, '_')}_pages.pptx`;

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Pages PPTX export error:', error);
    return internalErrorResponse();
  }
}
