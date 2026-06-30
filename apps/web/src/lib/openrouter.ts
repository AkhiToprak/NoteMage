/**
 * OpenRouter client — OpenAI-compatible REST accessed via `fetch` (no SDK dep).
 *
 * We route the GLM models through OpenRouter for a single live-cost surface:
 *   • GLM-4.7 → the former Haiku slots (quiz gen, default Mage, chat generation)
 *   • GLM-5.2 → the former Sonnet slots (ultra path structure, deep Mage)
 * Gemini stays Google-direct; Anthropic remains the fallback behind the
 * per-feature env overrides in model-routing.ts.
 *
 * Caching: GLM uses automatic, prefix-based (implicit) caching — no
 * `cache_control` markers. Keep the prompt PREFIX stable (system + static
 * context first, dynamic content last) and OpenRouter/GLM cache it
 * transparently; hits show up in `usage.cachedTokens`.
 *
 * Cost: OpenRouter returns the real per-call cost (USD) inline in every
 * response's `usage` object — no second call needed. `callOpenRouter` surfaces
 * it as `usage.costUsd` (what you're charged, incl. OpenRouter's margin) and
 * `usage.upstreamCostUsd` (raw provider cost), so callers can record actual
 * dollars into the meter.
 */

export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

// GLM model slugs on OpenRouter. Confirmed in the catalog 2026-06-28
// (https://openrouter.ai/models): glm-4.7 = $0.40/$1.75 per 1M, 203K ctx;
// glm-5.2 = $0.95/$3 per 1M, 1M ctx. Z.ai rotates point releases
// (4.6 → 4.7 → 5 → 5.2), so re-check the slug if a call 404s. Both env-overridable.
export const GLM_HAIKU_MODEL = process.env.GLM_HAIKU_MODEL?.trim() || 'z-ai/glm-4.7';
export const GLM_SONNET_MODEL = process.env.GLM_SONNET_MODEL?.trim() || 'z-ai/glm-5.2';

export interface OpenRouterUsage {
  inputTokens: number;
  outputTokens: number;
  /** Prompt tokens served from GLM's implicit prefix cache. */
  cachedTokens: number;
  /** Total USD charged to your OpenRouter account for this call (incl. OR margin). */
  costUsd: number;
  /** Raw upstream provider cost (USD) before OpenRouter's margin, when present. */
  upstreamCostUsd: number;
}

export interface OpenRouterResult {
  /** Assistant text content ('' when the model replied with only tool calls). */
  text: string;
  /** Parsed tool calls, when the model returned any (OpenAI shape). */
  toolCalls: Array<{ name: string; arguments: string }>;
  /** OpenRouter `finish_reason` for the choice. `'length'` ⇒ the response was
   *  cut off at `max_tokens` — any tool-call `arguments` are truncated JSON. */
  finishReason: string | null;
  usage: OpenRouterUsage;
}

/** OpenAI-compatible chat message (role + plain-text content). */
export interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CallOpenRouterOptions {
  /** OpenRouter model slug, e.g. `z-ai/glm-4.7`. */
  model: string;
  system?: string;
  /** Single-turn convenience. Provide this OR `messages` (messages wins). */
  user?: string;
  /** Multi-turn conversation history (OpenAI shape). When set, `user` is
   *  ignored and these messages are sent after the optional `system` message. */
  messages?: OpenRouterMessage[];
  /** OpenAI-style `response_format`, e.g. `{ type: 'json_schema', json_schema: {…} }`. */
  responseFormat?: Record<string, unknown>;
  /** OpenAI-style `tools` array. */
  tools?: Array<Record<string, unknown>>;
  toolChoice?: 'auto' | 'none' | 'required' | Record<string, unknown>;
  maxTokens?: number;
  temperature?: number;
  /**
   * GLM-4.6's reasoning mode interferes with reliable tool calling — pass
   * `disableReasoning: true` when forcing tools (the Mage path) so tool calls
   * land deterministically. Maps to OpenRouter's `reasoning.enabled = false`.
   */
  disableReasoning?: boolean;
  /**
   * OpenRouter sticky-routing token, forwarded as the `X-Session-Id` header.
   * OpenRouter pins all requests sharing a session id to the SAME upstream, so a
   * burst of calls reusing a long shared prefix (e.g. one path generation's
   * corpus) keeps hitting the same upstream's implicit prefix cache instead of
   * being load-balanced across upstreams that each cache-miss. Safe to combine
   * with `OPENROUTER_PROVIDER_ORDER` (that biases first contact; this pins after).
   */
  sessionId?: string;
  signal?: AbortSignal;
}

/** Raw usage block OpenRouter returns (inline for non-stream, final SSE chunk for stream). */
interface OpenRouterUsageRaw {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number };
  cost?: number;
  cost_details?: { upstream_inference_cost?: number };
}

/** Minimal shape of the non-streaming OpenRouter response we read. */
interface OpenRouterResponse {
  choices?: Array<{
    message?: {
      content?: string;
      tool_calls?: Array<{ function?: { name?: string; arguments?: string } }>;
    };
    /** `'stop'` (complete), `'tool_calls'`, or `'length'` (hit max_tokens). */
    finish_reason?: string | null;
  }>;
  usage?: OpenRouterUsageRaw;
}

/** Shared request headers (auth + optional app-ranking attribution + optional
 *  sticky-routing session id). */
function openRouterHeaders(apiKey: string, sessionId?: string): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    // Optional attribution — surfaces in OpenRouter's app rankings; harmless to omit.
    'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'https://notemage.app',
    'X-Title': 'NoteMage',
  };
  // Pins this request to the same upstream as others sharing the id → reliable
  // implicit prefix-cache hits across a generation run.
  if (sessionId) headers['X-Session-Id'] = sessionId;
  return headers;
}

/**
 * Build the OpenAI-compatible request body shared by the streaming and
 * non-streaming calls. When `stream` is set we also ask OpenRouter to include
 * usage accounting (incl. the real USD cost) in the final SSE chunk.
 */
function buildOpenRouterBody(opts: CallOpenRouterOptions, stream: boolean): Record<string, unknown> {
  const messages: Array<Record<string, unknown>> = [];
  if (opts.system) messages.push({ role: 'system', content: opts.system });
  if (opts.messages && opts.messages.length > 0) {
    for (const m of opts.messages) messages.push({ role: m.role, content: m.content });
  } else if (opts.user) {
    messages.push({ role: 'user', content: opts.user });
  }

  const body: Record<string, unknown> = {
    model: opts.model,
    messages,
    max_tokens: opts.maxTokens ?? 4096,
  };
  if (opts.temperature !== undefined) body.temperature = opts.temperature;
  if (opts.responseFormat) body.response_format = opts.responseFormat;
  if (opts.tools) body.tools = opts.tools;
  if (opts.toolChoice) body.tool_choice = opts.toolChoice;
  if (opts.disableReasoning) body.reasoning = { enabled: false };
  // Optional upstream preference. OpenRouter load-balances `z-ai/*` across
  // several upstreams and only some support prompt caching, so cache hits are
  // inconsistent run-to-run. Setting OPENROUTER_PROVIDER_ORDER (e.g. `z-ai`)
  // prefers the caching-capable upstream first; fallbacks stay enabled so a
  // down upstream still routes (caching when available, availability always).
  const providerOrder = process.env.OPENROUTER_PROVIDER_ORDER?.trim();
  if (providerOrder) {
    body.provider = { order: providerOrder.split(',').map((s) => s.trim()).filter(Boolean) };
  }
  if (stream) {
    body.stream = true;
    body.usage = { include: true };
  }
  return body;
}

/** Normalize OpenRouter's raw usage into our cost-bearing OpenRouterUsage. */
function normalizeUsage(usage: OpenRouterUsageRaw | undefined): OpenRouterUsage {
  return {
    inputTokens: usage?.prompt_tokens ?? 0,
    outputTokens: usage?.completion_tokens ?? 0,
    cachedTokens: usage?.prompt_tokens_details?.cached_tokens ?? 0,
    costUsd: typeof usage?.cost === 'number' ? usage.cost : 0,
    upstreamCostUsd:
      typeof usage?.cost_details?.upstream_inference_cost === 'number'
        ? usage.cost_details.upstream_inference_cost
        : 0,
  };
}

/**
 * Make a single (non-streaming) chat completion through OpenRouter and return
 * the text/tool calls plus normalized usage incl. the real USD cost. Throws on
 * a missing key or a non-2xx response (caller decides whether to fall back to
 * Anthropic).
 */
export async function callOpenRouter(opts: CallOpenRouterOptions): Promise<OpenRouterResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not set — add it to apps/web/.env.local');
  }

  const res = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: openRouterHeaders(apiKey, opts.sessionId),
    body: JSON.stringify(buildOpenRouterBody(opts, false)),
    signal: opts.signal,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`OpenRouter ${res.status} ${res.statusText}: ${errText.slice(0, 500)}`);
  }

  const json = (await res.json()) as OpenRouterResponse;
  const choice = json.choices?.[0];
  const message = choice?.message ?? {};

  const toolCalls = Array.isArray(message.tool_calls)
    ? message.tool_calls.map((tc) => ({
        name: tc.function?.name ?? '',
        arguments: tc.function?.arguments ?? '',
      }))
    : [];

  return {
    text: typeof message.content === 'string' ? message.content : '',
    toolCalls,
    finishReason: choice?.finish_reason ?? null,
    usage: normalizeUsage(json.usage),
  };
}

// ── Streaming (SSE) ──────────────────────────────────────────────────────────

/** Streamed delta frame from OpenRouter (OpenAI-compatible SSE). */
interface OpenRouterStreamFrame {
  choices?: Array<{
    delta?: {
      content?: string;
      reasoning?: string;
      tool_calls?: Array<{
        index?: number;
        id?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
    finish_reason?: string | null;
  }>;
  usage?: OpenRouterUsageRaw;
}

/** One event from the low-level OpenRouter stream. */
export type OpenRouterStreamEvent =
  | { type: 'text'; delta: string }
  | { type: 'reasoning'; delta: string }
  | { type: 'tool_call_delta'; index: number; id?: string; name?: string; argumentsDelta: string }
  | { type: 'finish'; reason: string | null }
  | { type: 'usage'; usage: OpenRouterUsage };

export interface OpenRouterStreamHandlers {
  /** Assistant prose deltas — enqueue these to the client SSE stream. */
  onText?: (delta: string) => void;
  /** GLM thinking deltas (reasoning models with reasoning ON) — usually dropped. */
  onReasoning?: (delta: string) => void;
}

const EMPTY_USAGE: OpenRouterUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cachedTokens: 0,
  costUsd: 0,
  upstreamCostUsd: 0,
};

/**
 * Low-level streaming call: yields text / reasoning / tool-call deltas and a
 * final usage event as OpenRouter's SSE arrives. Throws on a missing key or a
 * non-2xx response (the caller decides whether to fall back to Anthropic), and
 * honors `opts.signal` for abort. NOTE: GLM tool-call arguments stream in
 * fragments across many `tool_call_delta` events sharing the same `index` —
 * concatenate by index (the `streamOpenRouterText` collector below does this).
 */
export async function* streamOpenRouter(
  opts: CallOpenRouterOptions,
): AsyncGenerator<OpenRouterStreamEvent, void, unknown> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not set — add it to apps/web/.env.local');
  }

  const res = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: openRouterHeaders(apiKey, opts.sessionId),
    body: JSON.stringify(buildOpenRouterBody(opts, true)),
    signal: opts.signal,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`OpenRouter ${res.status} ${res.statusText}: ${errText.slice(0, 500)}`);
  }
  if (!res.body) {
    throw new Error('OpenRouter stream returned no response body');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let nl: number;
      while ((nl = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        // Skip blank lines and SSE comments (OpenRouter sends ': OPENROUTER PROCESSING' pings).
        if (!line || line.startsWith(':')) continue;
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') return;

        let frame: OpenRouterStreamFrame;
        try {
          frame = JSON.parse(payload) as OpenRouterStreamFrame;
        } catch {
          continue; // ignore an unparseable frame rather than aborting the stream
        }

        const delta = frame.choices?.[0]?.delta;
        if (delta) {
          if (typeof delta.content === 'string' && delta.content.length > 0) {
            yield { type: 'text', delta: delta.content };
          }
          if (typeof delta.reasoning === 'string' && delta.reasoning.length > 0) {
            yield { type: 'reasoning', delta: delta.reasoning };
          }
          if (Array.isArray(delta.tool_calls)) {
            for (const tc of delta.tool_calls) {
              yield {
                type: 'tool_call_delta',
                index: tc.index ?? 0,
                id: tc.id,
                name: tc.function?.name,
                argumentsDelta: tc.function?.arguments ?? '',
              };
            }
          }
        }
        // `finish_reason` rides on the choice (sibling to `delta`), not the delta.
        // Surface it so collectors can detect a `'length'` truncation.
        const finishReason = frame.choices?.[0]?.finish_reason;
        if (finishReason) {
          yield { type: 'finish', reason: finishReason };
        }
        if (frame.usage) {
          yield { type: 'usage', usage: normalizeUsage(frame.usage) };
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Convenience wrapper over `streamOpenRouter`: drives the stream, forwards text
 * (and optionally reasoning) deltas to `handlers`, accumulates the full text +
 * tool calls, and resolves to the same `OpenRouterResult` shape as
 * `callOpenRouter` — so a streaming call site reads identically to a buffered
 * one. Mirrors `streamGeminiChatText`; the chat / Mage paths call this.
 */
export async function streamOpenRouterText(
  opts: CallOpenRouterOptions,
  handlers: OpenRouterStreamHandlers = {},
): Promise<OpenRouterResult> {
  let text = '';
  const toolAcc = new Map<number, { name: string; arguments: string }>();
  let usage: OpenRouterUsage = EMPTY_USAGE;
  let finishReason: string | null = null;

  for await (const ev of streamOpenRouter(opts)) {
    switch (ev.type) {
      case 'text':
        text += ev.delta;
        handlers.onText?.(ev.delta);
        break;
      case 'reasoning':
        handlers.onReasoning?.(ev.delta);
        break;
      case 'tool_call_delta': {
        const cur = toolAcc.get(ev.index) ?? { name: '', arguments: '' };
        if (ev.name) cur.name = ev.name;
        cur.arguments += ev.argumentsDelta;
        toolAcc.set(ev.index, cur);
        break;
      }
      case 'finish':
        finishReason = ev.reason;
        break;
      case 'usage':
        usage = ev.usage;
        break;
    }
  }

  const toolCalls = [...toolAcc.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, v]) => ({ name: v.name, arguments: v.arguments }));

  return { text, toolCalls, finishReason, usage };
}
