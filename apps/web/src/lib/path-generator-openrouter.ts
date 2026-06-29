// OpenRouter/GLM-side wrapper for path-generation calls. Mirrors
// path-generator-anthropic.ts and path-generator-gemini.ts so the dispatcher
// (path-generator-routing.ts) can route the Anthropic DEFAULT slots — quiz
// Haiku and ultra-structure Sonnet — to GLM when GLM_COMPOSITION is on.
//
// GLM structured output goes through FORCED TOOL CALLS, not response_format
// json_schema (intermittently unreliable on GLM-4.7; forced tools are 100%
// reliable). We reuse the existing Anthropic tool definitions and translate
// them to the OpenAI/OpenRouter tool shape. Reasoning is disabled: GLM-4.7/5.2
// are reasoning models, and with reasoning ON the thinking tokens consume the
// output budget so the tool call / content comes back empty.

import type Anthropic from '@anthropic-ai/sdk';
import { callOpenRouter, type OpenRouterUsage } from './openrouter';
import { anthropicToolToOpenAI } from './openrouter-tools';

// GLM output ceiling — deliberately higher than the shared Anthropic
// MAX_OUTPUT_TOKENS (16k). Anthropic caps low because its non-streaming SDK
// rejects long-running requests; the OpenRouter path streams internally, so it
// has no such limit. The headroom is the truncation fix: with reasoning OFF and
// 32k of room, a single path activity (one theory section / one quiz, the unit
// of work is already small) finishes well inside the budget instead of hitting
// finish_reason=length. There is NO Claude fallback anymore, so staying under
// the cap is how generation stays reliable — if an activity ever still truncates
// at 32k, split that activity (e.g. batch quiz questions), don't raise this blindly.
const GLM_MAX_OUTPUT_TOKENS = 32000;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 4xx (except 429) are deterministic — a byte-identical retry will fail. */
function isNonRetryable(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : '';
  const m = msg.match(/OpenRouter (\d{3})/);
  if (!m) return false;
  const code = Number(m[1]);
  return code === 400 || code === 401 || code === 403 || code === 404;
}

/**
 * Call GLM via OpenRouter with `tool_choice` forced to the named tool — the
 * reliable structured-output path on GLM. Sends the full ordered tool array so
 * the tools render at a stable byte position (implicit-cache friendly), retries
 * up to `maxAttempts` with exponential backoff on transient errors, and parses
 * the forced tool call's arguments into `T`. Downstream Zod validators (shared
 * with the Anthropic/Gemini paths) still enforce the strict shape.
 */
export async function forcedStructuredCallOpenRouter<T>(opts: {
  /** Plain-string system prompt. No cache_control — GLM caches the prefix
   *  implicitly, so the caller leads with corpus + static rules, dynamic last. */
  system: string;
  /** The forced tool (reuse the existing Anthropic tool definitions). */
  tool: Anthropic.Messages.Tool;
  /** Full ordered tool array sent on every call (defaults to `[tool]`). */
  tools?: Anthropic.Messages.Tool[];
  userMessage?: string;
  maxAttempts?: number;
  /** GLM model slug (e.g. `z-ai/glm-4.7`). */
  model: string;
  maxTokens?: number;
  onUsage?: (usage: OpenRouterUsage) => void;
}): Promise<T> {
  const {
    system,
    tool,
    tools,
    userMessage = 'Generate now.',
    maxAttempts = 2,
    model,
    maxTokens = GLM_MAX_OUTPUT_TOKENS,
    onUsage,
  } = opts;
  const toolArray = (tools ?? [tool]).map(anthropicToolToOpenAI);
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await callOpenRouter({
        model,
        system,
        user: userMessage,
        tools: toolArray,
        toolChoice: { type: 'function', function: { name: tool.name } },
        maxTokens,
        disableReasoning: true,
      });
      onUsage?.(result.usage);
      // `finish_reason: 'length'` means GLM was cut off at max_tokens — the
      // forced tool call's `arguments` are truncated JSON and will never parse.
      // Throw a clear, retryable error so the dispatcher falls back to Anthropic
      // instead of surfacing a cryptic JSON-parse failure (reasoning models like
      // GLM-5.2 can burn the whole output budget on thinking and truncate here).
      if (result.finishReason === 'length') {
        throw new Error(
          `GLM ${tool.name} truncated at ${maxTokens}-token cap (finish_reason=length)`,
        );
      }
      const call = result.toolCalls.find((c) => c.name === tool.name) ?? result.toolCalls[0];
      if (!call) {
        throw new Error(`GLM did not call ${tool.name} (no tool call in response)`);
      }
      try {
        return JSON.parse(call.arguments) as T;
      } catch {
        throw new Error(`GLM ${tool.name} returned invalid JSON arguments`);
      }
    } catch (error) {
      lastError = error;
      if (isNonRetryable(error)) throw error;
      if (attempt < maxAttempts) {
        await sleep(1000 * Math.pow(2, attempt - 1));
      }
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`forcedStructuredCallOpenRouter(${tool.name}) failed after ${maxAttempts} attempts`);
}
