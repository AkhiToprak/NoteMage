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
// NOTE (PA-08): the rubric prefixes are ~470–600 tokens, far below the
// Haiku 4.5 minimum (4096 tok) and Sonnet 4.6 minimum (2048 tok).
// cache_control markers at these sizes are silent no-ops. The previously
// documented AC-Moderate-9 ≥80% cache-hit gate is unmeetable at current
// prompt sizes — it has never been satisfied. Comments below reflect
// the actual no-cache reality.
//
// PA-30 (injection hardening): untrusted author content (the payload)
// now rides the USER turn, not the system role. The system role carries
// only the rubric. This separates harness instructions from data.

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
 * Dispatch a structured moderation call. The rubric becomes the system
 * instruction on both providers; the per-path payload rides the USER
 * turn wrapped in BEGIN/END UNTRUSTED AUTHOR CONTENT markers (PA-30).
 * Anthropic returns the tool input cast to `T`; Gemini returns the
 * parsed JSON cast to `T`. Downstream Zod validators enforce the
 * strict shape — provider parity is the contract.
 */
export async function moderationStructuredCall<T>(
  ctx: ModerationCallCtx<T>,
): Promise<{ result: T; provider: ModerationProvider; model: string }> {
  const provider = ctx.providerOverride ?? resolveModerationProvider(ctx.layer);
  // Wrap the untrusted payload in markers so the model treats it as data.
  const userMessage = [
    'BEGIN UNTRUSTED AUTHOR CONTENT',
    ctx.payload,
    'END UNTRUSTED AUTHOR CONTENT',
    '',
    ctx.userMessage ?? 'Audit now.',
  ].join('\n');

  if (provider === 'anthropic') {
    const model = anthropicModelFor(ctx.layer);
    // System = rubric only (no untrusted content in the system role).
    // No cache_control: the rubric is ~470–600 tok, below Haiku's 4096
    // and Sonnet's 2048 minimum cacheable prefix — the marker was a no-op.
    const system: Anthropic.Messages.TextBlockParam[] = [
      { type: 'text', text: ctx.rubric },
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

  // Gemini branch — system = rubric only; user turn carries the payload.
  const model = GEMINI_PATH_MODEL;
  const systemInstruction = ctx.rubric;
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
