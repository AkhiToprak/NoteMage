import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { anthropic, AI_GENERATION_MODEL_LITE } from '@/lib/anthropic';
import { resolveModel } from '@/lib/model-routing';
import { logAiUsage } from '@/lib/ai-usage';
import { parseJsonLoose } from '@/lib/json-util';
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

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const rl = await rateLimit(rateLimitKey('essay-check', request, userId), 10, 60_000);
    if (!rl.success) {
      return tooManyRequestsResponse(
        'You are sending requests too fast. Please wait a moment.',
        rl.retryAfterMs
      );
    }

    const { id: notebookId } = await params;

    const notebook = await db.notebook.findFirst({
      where: { id: notebookId, userId },
    });
    if (!notebook) return notFoundResponse('Notebook not found');

    const body = await request.json();
    const { text, mode } = body as { text: string; mode: 'grammar' | 'full' };

    if (!text || text.trim().length === 0) {
      return badRequestResponse('Text is required');
    }
    if (text.length > 50000) {
      return badRequestResponse('Text is too long (max 50,000 characters)');
    }

    // Token budget check
    const { allowed, tokenLimit } = await checkTokenBudget(userId);
    if (!allowed) {
      return tooManyRequestsResponse(
        `Monthly token limit reached (${tokenLimit.toLocaleString()} tokens). Resets on the 1st of next month.`
      );
    }

    const checkMode = mode === 'full' ? 'full' : 'grammar';

    const systemPrompt = `You are an academic writing assistant. Analyze the provided text and return a JSON response.

${
  checkMode === 'grammar'
    ? `Check for:
1. Spelling errors (list each with correction)
2. Grammar issues (list each with explanation and fix)`
    : `Check for:
1. Spelling errors (list each with correction)
2. Grammar issues (list each with explanation and fix)
3. Clarity improvements (suggest rewording for unclear sentences)
4. Structure feedback (paragraph organization, transitions)`
}

You MUST respond with valid JSON only, no other text. Use this exact format:
{
  "issues": [
    {
      "type": "spelling" | "grammar" | "clarity" | "structure",
      "original": "the problematic text",
      "suggestion": "the corrected text",
      "explanation": "brief explanation"
    }
  ],
  "overallScore": <number 0-100>,
  "summary": "Brief overall assessment of the writing quality"
}

If there are no issues, return { "issues": [], "overallScore": 100, "summary": "No issues found." }`;

    // Essay grading is Anthropic-only (a precise grader). The composition moves
    // it Sonnet → Haiku; `ESSAY_MODEL` / `ESSAY_FULL_MODEL` override, and
    // MODEL_COMPOSITION_LEGACY=1 restores Sonnet. A non-anthropic override is
    // ignored (this route has no Gemini path).
    const resolved = resolveModel('essay', { action: checkMode });
    const model = resolved.provider === 'anthropic' ? resolved.model : AI_GENERATION_MODEL_LITE;

    const response = await anthropic.messages.create({
      model,
      max_tokens: 4000,
      system: systemPrompt,
      messages: [{ role: 'user', content: text }],
    });

    // Record token usage
    const totalTokens = response.usage.input_tokens + response.usage.output_tokens;
    await recordTokenUsage({
      notebookId,
      userId,
      tokens: totalTokens,
      description: `[essay-check] ${checkMode} check`,
    });
    logAiUsage({
      userId,
      feature: 'essay',
      provider: 'anthropic',
      model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
      extra: { mode: checkMode },
    });

    const responseText = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('');

    // Parse JSON response — G1 tolerant parse (handles fences / surrounding prose)
    let result;
    try {
      result = parseJsonLoose(responseText);
    } catch {
      result = {
        issues: [],
        overallScore: 0,
        summary: 'Failed to parse analysis results. Please try again.',
        raw: responseText,
      };
    }

    return successResponse(result);
  } catch (error) {
    console.error('Error checking essay:', error);
    return internalErrorResponse();
  }
}
