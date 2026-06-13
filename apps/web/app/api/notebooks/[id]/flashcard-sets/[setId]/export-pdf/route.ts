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
import { generateFlashcardPdf } from '@/lib/pdf-generator';

type Params = { params: Promise<{ id: string; setId: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const limit = await rateLimit(rateLimitKey('export', request, userId), 10, 60_000);
    if (!limit.success) {
      return tooManyRequestsResponse('Too many export requests', limit.retryAfterMs);
    }

    const { id: notebookId, setId } = await params;

    const notebook = await db.notebook.findFirst({ where: { id: notebookId, userId } });
    if (!notebook) return notFoundResponse('Notebook not found');

    const flashcardSet = await db.flashcardSet.findFirst({
      where: { id: setId, notebookId },
      include: { flashcards: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!flashcardSet) return notFoundResponse('Flashcard set not found');

    if (flashcardSet.flashcards.length > 500) {
      return badRequestResponse('Too many flashcards (max 500)');
    }

    const buffer = await generateFlashcardPdf(flashcardSet.title, flashcardSet.flashcards);
    const filename = `${flashcardSet.title.replace(/[^a-zA-Z0-9]/g, '_')}_flashcards.pdf`;

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('PDF export error:', error);
    return internalErrorResponse();
  }
}
