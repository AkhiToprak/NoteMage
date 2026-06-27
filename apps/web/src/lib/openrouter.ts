/**
 * OpenRouter client — OpenAI-compatible REST accessed via `fetch` (no SDK dep).
 *
 * We route the GLM models through OpenRouter for a single live-cost surface:
 *   • GLM-4.6 → the former Haiku slots (quiz gen, default Mage, chat generation)
 *   • GLM-5.x → the former Sonnet slots (ultra path structure, deep Mage)
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

// GLM model slugs on OpenRouter. Confirm the exact slug in the catalog
// (https://openrouter.ai/models) before relying on these — Z.ai rotates point
// releases (4.6 → 4.7 → 5.x). Both are env-overridable.
export const GLM_HAIKU_MODEL = process.env.GLM_HAIKU_MODEL?.trim() || 'z-ai/glm-4.6';
export const GLM_SONNET_MODEL = process.env.GLM_SONNET_MODEL?.trim() || 'z-ai/glm-5';

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
  usage: OpenRouterUsage;
}

export interface CallOpenRouterOptions {
  /** OpenRouter model slug, e.g. `z-ai/glm-4.6`. */
  model: string;
  system?: string;
  user: string;
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
  signal?: AbortSignal;
}

/** Minimal shape of the bits of the OpenRouter response we read. */
interface OpenRouterResponse {
  choices?: Array<{
    message?: {
      content?: string;
      tool_calls?: Array<{ function?: { name?: string; arguments?: string } }>;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
    cost?: number;
    cost_details?: { upstream_inference_cost?: number };
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

  const messages: Array<Record<string, unknown>> = [];
  if (opts.system) messages.push({ role: 'system', content: opts.system });
  messages.push({ role: 'user', content: opts.user });

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

  const res = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      // Optional attribution — surfaces in OpenRouter's app rankings; harmless to omit.
      'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'https://notemage.app',
      'X-Title': 'NoteMage',
    },
    body: JSON.stringify(body),
    signal: opts.signal,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`OpenRouter ${res.status} ${res.statusText}: ${errText.slice(0, 500)}`);
  }

  const json = (await res.json()) as OpenRouterResponse;
  const message = json.choices?.[0]?.message ?? {};
  const usage = json.usage ?? {};

  const toolCalls = Array.isArray(message.tool_calls)
    ? message.tool_calls.map((tc) => ({
        name: tc.function?.name ?? '',
        arguments: tc.function?.arguments ?? '',
      }))
    : [];

  return {
    text: typeof message.content === 'string' ? message.content : '',
    toolCalls,
    usage: {
      inputTokens: usage.prompt_tokens ?? 0,
      outputTokens: usage.completion_tokens ?? 0,
      cachedTokens: usage.prompt_tokens_details?.cached_tokens ?? 0,
      costUsd: typeof usage.cost === 'number' ? usage.cost : 0,
      upstreamCostUsd:
        typeof usage.cost_details?.upstream_inference_cost === 'number'
          ? usage.cost_details.upstream_inference_cost
          : 0,
    },
  };
}
