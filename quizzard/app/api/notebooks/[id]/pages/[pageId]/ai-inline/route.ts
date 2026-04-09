import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { anthropic, AI_MODEL } from '@/lib/anthropic';
import { checkTokenBudget, recordTokenUsage } from '@/lib/token-budget';
import { checkUsageLimit, incrementUsage } from '@/lib/usage-limits';
import { rateLimit, rateLimitKey } from '@/lib/rate-limit';
import {
  unauthorizedResponse,
  notFoundResponse,
  badRequestResponse,
  tooManyRequestsResponse,
  internalErrorResponse,
} from '@/lib/api-response';

/**
 * POST /api/notebooks/[id]/pages/[pageId]/ai-inline
 *
 * Inline AI rewrite/summarize/expand on a snippet of editor text.
 *
 * Body: { action: 'rewrite' | 'summarize' | 'expand', text: string }
 *
 * Tier gating:
 * - PRO only. FREE and PLUS users get HTTP 402 with `{ upgrade: true }`.
 *   The client surfaces a yellow upsell toast linking to /pricing.
 *
 * Response:
 * - SSE stream with `event: text` chunks (each carrying `{ delta }`),
 *   followed by a final `event: done` carrying `{ fullText, totalTokens }`,
 *   or `event: error` on failure.
 *
 * Reuses the same gating + streaming pattern as
 * `app/api/notebooks/[id]/chats/[chatId]/messages/route.ts` so token
 * accounting and rate limits stay consistent across all AI surfaces.
 */

type Params = { params: Promise<{ id: string; pageId: string }> };

type InlineAction = 'rewrite' | 'summarize' | 'expand';

const SYSTEM_PROMPTS: Record<InlineAction, string> = {
  rewrite: [
    'You are an inline editing assistant for a study app.',
    'Rewrite the user-supplied passage to be clearer, more concise, and more readable.',
    'Preserve the original meaning, key facts, and overall length (within +/- 20%).',
    'Return ONLY the rewritten text — no commentary, no quotes, no markdown fencing.',
    'If the passage is already perfect, return it unchanged.',
  ].join(' '),
  summarize: [
    'You are an inline editing assistant for a study app.',
    'Summarize the user-supplied passage into roughly one third of its length.',
    'Preserve the most important facts, names, and numbers.',
    'Return ONLY the summary — no commentary, no quotes, no markdown fencing, no "Summary:" prefix.',
  ].join(' '),
  expand: [
    'You are an inline editing assistant for a study app.',
    'Expand the user-supplied passage with more detail, examples, and explanation.',
    'Stay strictly on topic — do not invent facts the original did not imply.',
    'Aim for roughly double the original length.',
    'Return ONLY the expanded text — no commentary, no quotes, no markdown fencing.',
  ].join(' '),
};

const MAX_INPUT_CHARS = 4000;

function isValidAction(value: unknown): value is InlineAction {
  return value === 'rewrite' || value === 'summarize' || value === 'expand';
}

const encoder = new TextEncoder();
const sseEvent = (event: string, data: unknown) =>
  encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

export async function POST(request: NextRequest, { params }: Params) {
  try {
    // ── 1. Auth ───────────────────────────────────────────────
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: notebookId, pageId } = await params;

    // ── 2. Notebook ownership ─────────────────────────────────
    const notebook = await db.notebook.findFirst({
      where: { id: notebookId, userId },
      select: { id: true, name: true },
    });
    if (!notebook) return notFoundResponse('Notebook not found');

    // Make sure the page actually belongs to this notebook (defense in depth)
    const page = await db.page.findFirst({
      where: { id: pageId, section: { notebookId } },
      select: { id: true },
    });
    if (!page) return notFoundResponse('Page not found');

    // ── 3. Body validation ────────────────────────────────────
    const body = await request.json().catch(() => ({}));
    const { action, text } = body as { action?: unknown; text?: unknown };

    if (!isValidAction(action)) {
      return badRequestResponse('Invalid action. Must be rewrite, summarize, or expand.');
    }
    if (typeof text !== 'string' || text.trim().length === 0) {
      return badRequestResponse('Missing text.');
    }
    if (text.length > MAX_INPUT_CHARS) {
      return badRequestResponse(
        `Selection too large (${text.length} chars). Max is ${MAX_INPUT_CHARS}.`
      );
    }

    // ── 4. Rate limit (per-user, 20/min) ──────────────────────
    const rl = await rateLimit(rateLimitKey('ai-inline', request, userId), 20, 60_000);
    if (!rl.success) {
      return tooManyRequestsResponse(
        'You are sending requests too fast. Please wait a moment.',
        rl.retryAfterMs
      );
    }

    // ── 5. Token budget (monthly) ─────────────────────────────
    const { allowed: tokenAllowed, tokenLimit } = await checkTokenBudget(userId);
    if (!tokenAllowed) {
      return tooManyRequestsResponse(
        `Monthly token limit reached (${tokenLimit.toLocaleString()} tokens). Resets on the 1st of next month.`
      );
    }

    // ── 6. Tier gate (PRO only) ───────────────────────────────
    // We surface this with HTTP 402 + `upgrade: true` so the client can
    // distinguish "rate limited" from "needs to upgrade" and show a
    // dedicated upsell toast instead of a generic error.
    const usage = await checkUsageLimit(userId, 'ai_inline_edit');
    if (!usage.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: 'Inline AI editing is a Pro feature.',
          upgrade: true,
        },
        { status: 402 }
      );
    }

    // ── 7. Stream from Claude ─────────────────────────────────
    const abortController = new AbortController();
    const onAbort = () => abortController.abort();
    request.signal.addEventListener('abort', onAbort);

    const systemPrompt = SYSTEM_PROMPTS[action];
    const stream = anthropic.messages.stream(
      {
        model: AI_MODEL,
        max_tokens: 2048,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: text,
          },
        ],
      },
      { signal: abortController.signal }
    );

    return new Response(
      new ReadableStream({
        async start(controller) {
          let fullText = '';

          stream.on('text', (delta) => {
            fullText += delta;
            controller.enqueue(sseEvent('text', { delta }));
          });

          try {
            const response = await stream.finalMessage();
            const totalTokens =
              response.usage.input_tokens + response.usage.output_tokens;

            // Token accounting + usage increment AFTER successful completion
            await recordTokenUsage({
              notebookId,
              userId,
              tokens: totalTokens,
              description: `[inline-ai] ${action} on page ${pageId}`,
            });
            await incrementUsage(userId, 'ai_inline_edit');

            controller.enqueue(
              sseEvent('done', {
                fullText,
                totalTokens,
              })
            );
            controller.close();
          } catch (err) {
            const message =
              err instanceof Error ? err.message : 'AI request failed.';
            controller.enqueue(sseEvent('error', { error: message }));
            controller.close();
          } finally {
            request.signal.removeEventListener('abort', onAbort);
          }
        },
      }),
      {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
        },
      }
    );
  } catch (error) {
    console.error('[ai-inline] unexpected error:', error);
    return internalErrorResponse();
  }
}
