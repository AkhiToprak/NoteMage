// Moderation model dispatcher. Sister to `path-generator-routing.ts`,
// but scoped to the L2/L3 audit calls so each layer can flip provider
// independently of the path-generation pipeline.
//
// L2 wants the cheapest sensible model (default: Gemini 2.5 Flash);
// L3 wants the strongest (default: Anthropic Sonnet). Both knobs are
// env-driven so Coolify can rotate them without a redeploy. Unknown
// values fall through to the layer-specific default — never the
// path-generation default — so a stale PATH_PROVIDER setting can't
// silently steer moderation.
//
// Per AC-Moderate-9, the rubric block is byte-identical across every
// call so Anthropic prompt-cache hits after the warm-up call. We pass
// the rubric as a `cache_control: ephemeral` text block on Anthropic
// and as the leading systemInstruction text on Gemini (implicit cache).

import type Anthropic from '@anthropic-ai/sdk';
import { AI_GENERATION_MODEL, AI_GENERATION_MODEL_LITE } from '../anthropic';
import { GEMINI_PATH_MODEL } from '../gemini';
import {
  forcedStructuredCallAnthropic,
} from '../path-generator-anthropic';
import {
  forcedStructuredCallGemini,
  type GeminiUsage,
} from '../path-generator-gemini';

export type ModerationProvider = 'anthropic' | 'gemini';
export type ModerationLayer = 'l2' | 'l3';

export interface ModerationUsage {
  provider: ModerationProvider;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  /** 0 on Gemini in v1 — implicit caching has no separate write line. */
  cacheWriteTokens: number;
}

function isProvider(value: string | undefined): value is ModerationProvider {
  return value === 'anthropic' || value === 'gemini';
}

/**
 * Resolve the provider for an L2 or L3 call. Each layer has its own env
 * key + its own default so toggling one doesn't accidentally toggle the
 * other.
 *
 *   L2: MODERATION_L2_PROVIDER  → default 'gemini'  (cheap; per P0 §7.2)
 *   L3: MODERATION_L3_PROVIDER  → default 'anthropic' (strong; per P0 §7.3)
 */
export function resolveModerationProvider(layer: ModerationLayer): ModerationProvider {
  const key = layer === 'l2' ? 'MODERATION_L2_PROVIDER' : 'MODERATION_L3_PROVIDER';
  const val = process.env[key];
  if (isProvider(val)) return val;
  return layer === 'l2' ? 'gemini' : 'anthropic';
}

/**
 * Pick the Anthropic model for a given moderation layer. L2 wants
 * Haiku (cheapest sensible Anthropic option, matches the L2 budget
 * comfortably); L3 wants Sonnet for stronger reasoning.
 */
function anthropicModelFor(layer: ModerationLayer): string {
  return layer === 'l2' ? AI_GENERATION_MODEL_LITE : AI_GENERATION_MODEL;
}

export interface ModerationCallCtx<T> {
  /** Which layer this call belongs to — drives provider + model picks. */
  layer: ModerationLayer;
  /** Byte-identical rubric block — cached at the provider level. */
  rubric: string;
  /** Per-path payload (title + description + summarised content). */
  payload: string;
  /** Anthropic tool definition forcing the strict JSON verdict shape. */
  anthropicTool: Anthropic.Messages.Tool;
  /** Optional `responseSchema` for Gemini; when omitted only JSON mode. */
  geminiSchema?: object;
  /** Default 'Audit now.' — overrideable so retries can carry context. */
  userMessage?: string;
  /** Default 2. Same retry semantics as path-generator-routing. */
  maxAttempts?: number;
  /** Per-attempt token usage in normalized shape. */
  onUsage?: (usage: ModerationUsage) => void;
  /** Provider override — wins over env. Used in tests/admin re-judge. */
  providerOverride?: ModerationProvider;
  /** Marks the unused generic so callers don't have to widen at use. */
  _phantom?: T;
}

/**
 * Dispatch a structured moderation call. The rubric becomes the cached
 * leading block on both providers (`cache_control: ephemeral` on
 * Anthropic, leading concat on Gemini); the per-path payload is the
 * tail. Anthropic returns the tool input cast to `T`; Gemini returns
 * the parsed JSON cast to `T`. Downstream Zod validators enforce the
 * strict shape — provider parity is the contract.
 */
export async function moderationStructuredCall<T>(
  ctx: ModerationCallCtx<T>,
): Promise<{ result: T; provider: ModerationProvider; model: string }> {
  const provider = ctx.providerOverride ?? resolveModerationProvider(ctx.layer);
  const userMessage = ctx.userMessage ?? 'Audit now.';

  if (provider === 'anthropic') {
    const model = anthropicModelFor(ctx.layer);
    // Mirrors buildCachedSystem(): rubric is the ephemeral-cached leading
    // block, per-path payload is the tail. Kept inline so this module
    // doesn't depend on path-prompts internals.
    const system: Anthropic.Messages.TextBlockParam[] = [
      { type: 'text', text: ctx.rubric, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: ctx.payload },
    ];
    const result = await forcedStructuredCallAnthropic<T>({
      system,
      tool: ctx.anthropicTool,
      userMessage,
      maxAttempts: ctx.maxAttempts,
      model,
      onUsage: (usage) =>
        ctx.onUsage?.({
          provider: 'anthropic',
          model,
          inputTokens: usage.input_tokens,
          outputTokens: usage.output_tokens,
          cacheReadTokens: usage.cache_read_input_tokens ?? 0,
          cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
        }),
    });
    return { result, provider, model };
  }

  // Gemini branch — flat systemInstruction, byte-identical leading
  // rubric so implicit caching matches across calls (per AC-Moderate-9).
  const model = GEMINI_PATH_MODEL;
  const systemInstruction = `${ctx.rubric}\n\n${ctx.payload}`;
  const result = await forcedStructuredCallGemini<T>({
    systemInstruction,
    responseSchema: ctx.geminiSchema,
    userMessage,
    maxAttempts: ctx.maxAttempts,
    model,
    onUsage: (usage: GeminiUsage) =>
      ctx.onUsage?.({
        provider: 'gemini',
        model,
        inputTokens: usage.promptTokens,
        outputTokens: usage.candidatesTokens,
        cacheReadTokens: usage.cachedTokens,
        cacheWriteTokens: 0,
      }),
  });
  return { result, provider, model };
}
