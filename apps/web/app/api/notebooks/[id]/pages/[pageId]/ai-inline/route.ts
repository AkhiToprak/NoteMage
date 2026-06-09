import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { anthropic, AI_MODEL } from '@/lib/anthropic';
import { resolveModel, type ModelFeature } from '@/lib/model-routing';
import { streamGeminiText } from '@/lib/gemini-text';
import { logAiUsage } from '@/lib/ai-usage';
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
 * - PRO only. FREE users get HTTP 402 with `{ upgrade: true }`.
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

// Shared formatting contract. The client renders the reply as Markdown and
// converts it into real editor nodes (see src/lib/markdown-to-html.ts), so the
// model SHOULD reach for Markdown when the content genuinely calls for it —
// fenced code blocks (with a language) for code, lists for enumerations,
// tables for tabular data, **bold**/*italic* for emphasis, and `## headings`
// for longer structured passages. Callouts use GitHub admonition syntax on a
// blockquote — the supported kinds are [!INFO]/[!NOTE], [!TIP], [!WARNING],
// and [!SUCCESS], e.g.:
//   > [!TIP]
//   > Keep the chain rule handy here.
const FORMATTING_RULES = [
  'Write in GitHub-Flavored Markdown.',
  'Match the formatting to the content and to the scale of the input: a short passage stays plain prose, while structured material should use the right element.',
  'Use fenced code blocks with a language tag for code, bullet or numbered lists for enumerations, tables for tabular data, and **bold**/*italic* for emphasis.',
  'For asides use a callout — a blockquote opening with one of [!INFO], [!TIP], [!WARNING], or [!SUCCESS], e.g. "> [!TIP]\\n> ...".',
  'Do not wrap the entire reply in a code fence, add commentary, or surround it in quotes.',
].join(' ');

const SYSTEM_PROMPTS: Record<InlineAction, string> = {
  rewrite: [
    'You are an inline editing assistant for a study app.',
    'Rewrite the user-supplied passage to be clearer, more concise, and more readable.',
    'Preserve the original meaning, key facts, formatting, and overall length (within +/- 20%).',
    FORMATTING_RULES,
    'Return ONLY the rewritten passage. If it is already perfect, return it unchanged.',
  ].join(' '),
  summarize: [
    'You are an inline editing assistant for a study app.',
    'Summarize the user-supplied passage into roughly one third of its length.',
    'Preserve the most important facts, names, and numbers.',
    'A bullet list is often the clearest format for a summary.',
    FORMATTING_RULES,
    'Return ONLY the summary — no "Summary:" prefix.',
  ].join(' '),
  expand: [
    'You are an inline editing assistant for a study app.',
    'Expand the user-supplied passage with more detail, examples, and explanation.',
    'Stay strictly on topic — do not invent facts the original did not imply.',
    'Aim for roughly double the original length.',
    'Structure longer output with headings, lists, code blocks, and callouts where they aid understanding.',
    FORMATTING_RULES,
    'Return ONLY the expanded passage.',
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

    // ── 7. Stream the edit ────────────────────────────────────
    // Composition routes rewrite/summarize → Flash-Lite, expand → Haiku
    // (the one action that hallucinated on the cheap model). INLINE_*_MODEL
    // override; MODEL_COMPOSITION_LEGACY=1 restores Haiku. Gemini failure before
    // any token is streamed falls back to Anthropic; a mid-stream failure
    // finalizes the partial (no duplicate restart).
    const systemPrompt = SYSTEM_PROMPTS[action];
    const resolved = resolveModel(`inline-${action}` as ModelFeature);

    const abortController = new AbortController();
    const onAbort = () => abortController.abort();
    request.signal.addEventListener('abort', onAbort);

    return new Response(
      new ReadableStream({
        async start(controller) {
          let fullText = '';
          const enqueueText = (delta: string) => {
            fullText += delta;
            controller.enqueue(sseEvent('text', { delta }));
          };

          const finalize = async (
            inputTokens: number,
            outputTokens: number,
            provider: 'anthropic' | 'gemini',
            model: string
          ) => {
            const totalTokens = inputTokens + outputTokens;
            await recordTokenUsage({
              notebookId,
              userId,
              tokens: totalTokens,
              description: `[inline-ai] ${action} on page ${pageId}`,
            });
            await incrementUsage(userId, 'ai_inline_edit');
            logAiUsage({
              userId,
              feature: `inline-${action}`,
              provider,
              model,
              inputTokens,
              outputTokens,
              extra: { action },
            });
            controller.enqueue(sseEvent('done', { fullText, totalTokens }));
            controller.close();
          };

          try {
            // ── Gemini branch (rewrite/summarize by default) ──
            if (resolved.provider === 'gemini') {
              try {
                const { usage } = await streamGeminiText({
                  system: systemPrompt,
                  userText: text,
                  signal: abortController.signal,
                  onText: enqueueText,
                  model: resolved.model,
                  maxOutputTokens: 2048,
                });
                if (abortController.signal.aborted) {
                  await finalize(0, 0, 'gemini', resolved.model);
                  return;
                }
                await finalize(usage.promptTokens, usage.candidatesTokens, 'gemini', resolved.model);
                return;
              } catch (geminiErr) {
                if (abortController.signal.aborted) {
                  await finalize(0, 0, 'gemini', resolved.model);
                  return;
                }
                if (fullText.length > 0) {
                  console.error('[ai-inline] Gemini mid-stream error:', geminiErr);
                  await finalize(0, 0, 'gemini', resolved.model);
                  return;
                }
                console.error(
                  '[ai-inline] Gemini failed pre-stream, falling back to Anthropic:',
                  geminiErr
                );
                // fall through to Anthropic
              }
            }

            // ── Anthropic branch (expand default, legacy, + Gemini fallback) ──
            const anthropicModel = resolved.provider === 'anthropic' ? resolved.model : AI_MODEL;
            const stream = anthropic.messages.stream(
              {
                model: anthropicModel,
                max_tokens: 2048,
                system: systemPrompt,
                messages: [{ role: 'user', content: text }],
              },
              { signal: abortController.signal }
            );
            stream.on('text', enqueueText);
            const response = await stream.finalMessage();
            await finalize(
              response.usage.input_tokens,
              response.usage.output_tokens,
              'anthropic',
              anthropicModel
            );
          } catch (err) {
            if (abortController.signal.aborted) {
              // Finalize whatever streamed so the client keeps the partial edit.
              await finalize(0, 0, 'anthropic', AI_MODEL).catch(() => {
                controller.enqueue(sseEvent('error', { error: 'Failed to save partial response' }));
                controller.close();
              });
              return;
            }
            const message = err instanceof Error ? err.message : 'AI request failed.';
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
