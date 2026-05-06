import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { anthropic } from '@/lib/anthropic';
import { checkTokenBudget, recordTokenUsage } from '@/lib/token-budget';
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

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
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

    const responseText = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('');

    // Parse JSON response
    let result;
    try {
      // Try to extract JSON from the response (handle potential markdown code blocks)
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      result = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(responseText);
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
