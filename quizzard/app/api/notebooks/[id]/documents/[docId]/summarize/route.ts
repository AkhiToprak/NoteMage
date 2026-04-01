import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { anthropic, AI_MODEL, MONTHLY_TOKEN_LIMIT } from '@/lib/anthropic';
import { checkTokenBudget, recordTokenUsage } from '@/lib/token-budget';
import {
  successResponse,
  badRequestResponse,
  unauthorizedResponse,
  notFoundResponse,
  tooManyRequestsResponse,
  internalErrorResponse,
} from '@/lib/api-response';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: notebookId, docId } = await params;

    // Verify notebook ownership
    const notebook = await db.notebook.findFirst({
      where: { id: notebookId, userId },
    });
    if (!notebook) return notFoundResponse('Notebook not found');

    // Fetch document
    const document = await db.document.findFirst({
      where: { id: docId, notebookId },
    });
    if (!document) return notFoundResponse('Document not found');
    if (!document.textContent) return badRequestResponse('Document has no text content to summarize');

    const { searchParams } = new URL(request.url);
    const regenerate = searchParams.get('regenerate') === 'true';

    const body = await request.json().catch(() => ({}));
    const length = (body as { length?: string }).length === 'detailed' ? 'detailed' : 'brief';

    // Check cache
    if (!regenerate) {
      const cached = await db.documentSummary.findUnique({
        where: { documentId_length: { documentId: docId, length } },
      });
      if (cached) {
        return successResponse({ summary: cached.content, cached: true });
      }
    }

    // Token budget check (only when we're about to call the API)
    const { allowed } = await checkTokenBudget(userId);
    if (!allowed) {
      return tooManyRequestsResponse(
        `Monthly token limit reached (${MONTHLY_TOKEN_LIMIT.toLocaleString()} tokens). Resets on the 1st of next month.`
      );
    }

    // Generate with Claude
    const prompt = length === 'brief'
      ? `Summarize the following document in 3-5 concise bullet points. Focus on the key takeaways.\n\nDocument:\n${document.textContent.slice(0, 15000)}`
      : `Provide a comprehensive summary of the following document. Include:\n- Key points and main arguments\n- Important details and supporting evidence\n- Conclusions and implications\n\nFormat with clear headings and bullet points.\n\nDocument:\n${document.textContent.slice(0, 15000)}`;

    const response = await anthropic.messages.create({
      model: AI_MODEL,
      max_tokens: length === 'brief' ? 500 : 1500,
      messages: [{ role: 'user', content: prompt }],
    });

    // Record token usage
    const totalTokens = response.usage.input_tokens + response.usage.output_tokens;
    await recordTokenUsage({
      notebookId,
      userId,
      tokens: totalTokens,
      description: `[summarize] ${length} summary for "${document.fileName}"`,
    });

    const summaryContent = response.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n');

    // Cache the summary
    await db.documentSummary.upsert({
      where: { documentId_length: { documentId: docId, length } },
      update: { content: summaryContent },
      create: { documentId: docId, length, content: summaryContent },
    });

    return successResponse({ summary: summaryContent, cached: false });
  } catch (error) {
    console.error('Error summarizing document:', error);
    return internalErrorResponse();
  }
}
