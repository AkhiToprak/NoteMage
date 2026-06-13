import { NextRequest } from 'next/server';
import { z } from 'zod';
import type Anthropic from '@anthropic-ai/sdk';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { anthropic, AI_GENERATION_MODEL_LITE } from '@/lib/anthropic';
import { resolveModel } from '@/lib/model-routing';
import { logAiUsage } from '@/lib/ai-usage';
import { checkTokenBudget, recordTokenUsage } from '@/lib/token-budget';
import { costRateLimit, rateLimitKey } from '@/lib/rate-limit';
import {
  successResponse,
  badRequestResponse,
  unauthorizedResponse,
  notFoundResponse,
  tooManyRequestsResponse,
  internalErrorResponse,
} from '@/lib/api-response';

// ── Zod schemas ───────────────────────────────────────────────────────────────

// Grammar mode: only spelling/grammar issue types.
const GrammarIssueSchema = z.object({
  type: z.enum(['spelling', 'grammar']),
  original: z.string(),
  suggestion: z.string(),
  explanation: z.string(),
});

// Full mode: all four issue types.
const FullIssueSchema = z.object({
  type: z.enum(['spelling', 'grammar', 'clarity', 'structure']),
  original: z.string(),
  suggestion: z.string(),
  explanation: z.string(),
});

const EssayResultSchema = (mode: 'grammar' | 'full') =>
  z.object({
    issues: z.array(mode === 'grammar' ? GrammarIssueSchema : FullIssueSchema),
    overallScore: z.number().min(0).max(100),
    summary: z.string(),
  });

// ── Tool definition ───────────────────────────────────────────────────────────

const ESSAY_TOOL_GRAMMAR: Anthropic.Messages.Tool = {
  name: 'report_essay_analysis',
  description: 'Report the grammar and spelling analysis of the essay.',
  input_schema: {
    type: 'object',
    properties: {
      issues: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['spelling', 'grammar'] },
            original: { type: 'string', description: 'The problematic text from the essay.' },
            suggestion: { type: 'string', description: 'The corrected text.' },
            explanation: { type: 'string', description: 'Brief explanation of the issue.' },
          },
          required: ['type', 'original', 'suggestion', 'explanation'],
        },
      },
      overallScore: {
        type: 'number',
        description:
          'Score 0–100. 100 = publication-ready; deduct per issue weighted by severity (major grammar/spelling = −5 to −15 each, minor = −1 to −4).',
      },
      summary: { type: 'string', description: 'Brief overall assessment of the writing quality.' },
    },
    required: ['issues', 'overallScore', 'summary'],
  },
};

const ESSAY_TOOL_FULL: Anthropic.Messages.Tool = {
  name: 'report_essay_analysis',
  description: 'Report the full writing analysis of the essay.',
  input_schema: {
    type: 'object',
    properties: {
      issues: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['spelling', 'grammar', 'clarity', 'structure'],
            },
            original: { type: 'string', description: 'The problematic text from the essay.' },
            suggestion: { type: 'string', description: 'The corrected or improved text.' },
            explanation: { type: 'string', description: 'Brief explanation of the issue.' },
          },
          required: ['type', 'original', 'suggestion', 'explanation'],
        },
      },
      overallScore: {
        type: 'number',
        description:
          'Score 0–100. 100 = publication-ready; deduct per issue weighted by severity (major grammar/spelling = −5 to −15 each, clarity/structure = −2 to −8 each, minor = −1 to −3).',
      },
      summary: { type: 'string', description: 'Brief overall assessment of the writing quality.' },
    },
    required: ['issues', 'overallScore', 'summary'],
  },
};

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const rl = await costRateLimit(rateLimitKey('essay-check', request, userId), 10, 60_000);
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
    const essayTool = checkMode === 'grammar' ? ESSAY_TOOL_GRAMMAR : ESSAY_TOOL_FULL;

    const systemPrompt =
      checkMode === 'grammar'
        ? [
            'You are an academic writing assistant.',
            'Check the essay for spelling errors and grammar issues.',
            'Write suggestion/explanation/summary in the language of the essay.',
          ].join(' ')
        : [
            'You are an academic writing assistant.',
            'Check the essay for spelling errors, grammar issues, clarity improvements, and structure feedback.',
            'Write suggestion/explanation/summary in the language of the essay.',
          ].join(' ');

    // Essay grading is Anthropic-only (a precise grader). The composition moves
    // it Sonnet → Haiku; `ESSAY_MODEL` / `ESSAY_FULL_MODEL` override, and
    // MODEL_COMPOSITION_LEGACY=1 restores Sonnet. A non-anthropic override is
    // ignored (this route has no Gemini path).
    const resolved = resolveModel('essay', { action: checkMode });
    const model = resolved.provider === 'anthropic' ? resolved.model : AI_GENERATION_MODEL_LITE;

    // PA-24: forced tool call instead of prose JSON.
    const response = await anthropic.messages.create({
      model,
      max_tokens: 4000,
      system: systemPrompt,
      messages: [{ role: 'user', content: text }],
      tools: [essayTool],
      tool_choice: { type: 'tool', name: 'report_essay_analysis' },
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

    // PA-24: check for truncation before attempting to parse.
    if (response.stop_reason === 'max_tokens') {
      return badRequestResponse(
        'Essay too long — analysis was truncated. Try a shorter passage or use grammar-only mode.'
      );
    }

    // Extract tool input.
    const toolBlock = response.content.find((b) => b.type === 'tool_use');
    if (!toolBlock || toolBlock.type !== 'tool_use') {
      // Model didn't call the tool (unexpected); fail cleanly without leaking output.
      return successResponse({
        issues: [],
        overallScore: null,
        summary: 'Analysis failed. Please try again.',
      });
    }

    // PA-24: validate with zod before returning to the client.
    const parsed = EssayResultSchema(checkMode).safeParse(toolBlock.input);
    if (!parsed.success) {
      return successResponse({
        issues: [],
        overallScore: null,
        summary: 'Analysis failed. Please try again.',
      });
    }

    return successResponse(parsed.data);
  } catch (error) {
    console.error('Error checking essay:', error);
    return internalErrorResponse();
  }
}
