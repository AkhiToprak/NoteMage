import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { anthropic, AI_MODEL, MAX_CONTEXT_CHARS } from '@/lib/anthropic';
import { resolveModel } from '@/lib/model-routing';
import { generateGeminiText } from '@/lib/gemini-text';
import { logAiUsage } from '@/lib/ai-usage';
import { checkTokenBudget, recordTokenUsage } from '@/lib/token-budget';
import { rateLimit, rateLimitKey } from '@/lib/rate-limit';
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

    const rl = await rateLimit(rateLimitKey('doc-summarize', request, userId), 10, 60_000);
    if (!rl.success) {
      return tooManyRequestsResponse(
        'You are sending requests too fast. Please wait a moment.',
        rl.retryAfterMs
      );
    }

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
    if (!document.textContent)
      return badRequestResponse('Document has no text content to summarize');

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
    const { allowed, tokenLimit } = await checkTokenBudget(userId);
    if (!allowed) {
      return tooManyRequestsResponse(
        `Monthly token limit reached (${tokenLimit.toLocaleString()} tokens). Resets on the 1st of next month.`
      );
    }

    // Generate the summary. Composition routes doc summaries Haiku → Flash-Lite
    // (DOCSUM_MODEL override; MODEL_COMPOSITION_LEGACY=1 restores Haiku). Gemini
    // failure falls back to Anthropic so a summary always comes back.
    const prompt =
      length === 'brief'
        ? `Summarize the following document in 3-5 concise bullet points. Focus on the key takeaways.\n\nDocument:\n${document.textContent.slice(0, MAX_CONTEXT_CHARS)}`
        : `Provide a comprehensive summary of the following document. Include:\n- Key points and main arguments\n- Important details and supporting evidence\n- Conclusions and implications\n\nFormat with clear headings and bullet points.\n\nDocument:\n${document.textContent.slice(0, MAX_CONTEXT_CHARS)}`;

    const maxTokens = length === 'brief' ? 500 : 1500;
    const DOCSUM_SYSTEM = 'You are a study assistant that writes faithful, well-structured document summaries. Output only the summary — no preamble.';

    const runAnthropic = async (model: string) => {
      const r = await anthropic.messages.create({
        model,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      });
      return {
        text: r.content
          .filter((block) => block.type === 'text')
          .map((block) => block.text)
          .join('\n'),
        inTok: r.usage.input_tokens,
        outTok: r.usage.output_tokens,
        cacheRead: r.usage.cache_read_input_tokens ?? 0,
      };
    };

    const resolved = resolveModel('doc-summarize');
    let summaryContent: string;
    let usedProvider: 'anthropic' | 'gemini';
    let usedModel: string;
    let inTok: number;
    let outTok: number;
    let cacheRead = 0;

    if (resolved.provider === 'gemini') {
      try {
        const { text, usage } = await generateGeminiText({
          system: DOCSUM_SYSTEM,
          userText: prompt,
          model: resolved.model,
          maxOutputTokens: maxTokens,
          temperature: 0.3,
        });
        summaryContent = text;
        usedProvider = 'gemini';
        usedModel = resolved.model;
        inTok = usage.promptTokens;
        outTok = usage.candidatesTokens;
        cacheRead = usage.cachedTokens;
      } catch (gErr) {
        console.error('[summarize] Gemini failed, falling back to Anthropic:', gErr);
        const a = await runAnthropic(AI_MODEL);
        summaryContent = a.text;
        usedProvider = 'anthropic';
        usedModel = AI_MODEL;
        inTok = a.inTok;
        outTok = a.outTok;
        cacheRead = a.cacheRead;
      }
    } else {
      const model = resolved.provider === 'anthropic' ? resolved.model : AI_MODEL;
      const a = await runAnthropic(model);
      summaryContent = a.text;
      usedProvider = 'anthropic';
      usedModel = model;
      inTok = a.inTok;
      outTok = a.outTok;
      cacheRead = a.cacheRead;
    }

    // Record token usage
    const totalTokens = inTok + outTok;
    await recordTokenUsage({
      notebookId,
      userId,
      tokens: totalTokens,
      description: `[summarize] ${length} summary for "${document.fileName}"`,
    });
    logAiUsage({
      userId,
      feature: 'doc-summarize',
      provider: usedProvider,
      model: usedModel,
      inputTokens: inTok,
      outputTokens: outTok,
      cacheReadTokens: cacheRead,
      extra: { length },
    });

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
