import { NextRequest } from 'next/server';
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
import { importFromUrl, SSRFError } from '@/lib/url-import';
import { textToTipTapJSON } from '@/lib/contentConverter';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

type Params = { params: Promise<{ id: string; sectionId: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    // Rate limit: 10 requests per minute per IP
    const ip = getClientIp(request);
    const rl = await rateLimit(`url-import:${ip}`, 10, 60_000);
    if (!rl.success) {
      return tooManyRequestsResponse(
        'Too many URL import requests. Please try again later.',
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

    // Parse JSON body
    let body: { url?: string };
    try {
      body = await request.json();
    } catch {
      return badRequestResponse('Invalid JSON body');
    }

    const { url } = body;
    if (!url || typeof url !== 'string' || !url.trim()) {
      return badRequestResponse('A valid URL is required');
    }

    // Fetch and extract content
    let result;
    try {
      result = await importFromUrl(url.trim());
    } catch (err) {
      if (err instanceof SSRFError) {
        return badRequestResponse(err.message);
      }
      const message = err instanceof Error ? err.message : 'Failed to import URL';
      return badRequestResponse(message);
    }

    // Convert to TipTap JSON
    const content: object = textToTipTapJSON(result.textContent);

    // Determine sort order for the new page
    const maxOrder = await db.page.aggregate({
      where: { sectionId },
      _max: { sortOrder: true },
    });
    const sortOrder = (maxOrder._max.sortOrder ?? -1) + 1;

    // Create the page
    const page = await db.page.create({
      data: {
        sectionId,
        title: result.title,
        content,
        textContent: result.textContent,
        sortOrder,
        sourceDocId: null,
      },
    });

    return createdResponse(page);
  } catch (error) {
    console.error('URL import error:', error);
    return internalErrorResponse();
  }
}
