// P10 — translation provider dispatcher. Sister to `model-call.ts`
// (which serves moderation L2/L3) and `path-generator-routing.ts` (which
// serves path generation). Scoped narrowly to the translation call so
// translation provider rotation never leaks into the moderation or
// path-generation paths.
//
// Default is Gemini 2.5 Flash — cheap, fast, structured-output capable.
// Anthropic Haiku is the fallback (TRANSLATION_PROVIDER=anthropic) when
// Gemini is degraded or for AB-testing translation quality.
//
// Per AC-Translate-3 / P0 §7.4 the rubric block must be cache-able so
// repeat translations into the same language hit the prompt cache after
// the warm-up call. On Anthropic the rubric carries `cache_control:
// ephemeral`; on Gemini the rubric leads the systemInstruction so
// implicit caching matches.

import type Anthropic from '@anthropic-ai/sdk';
import { AI_GENERATION_MODEL_LITE } from '../anthropic';
import { GEMINI_PATH_MODEL } from '../gemini';
import { forcedStructuredCallAnthropic } from '../path-generator-anthropic';
import {
  forcedStructuredCallGemini,
  type GeminiUsage,
} from '../path-generator-gemini';

export type TranslationProvider = 'anthropic' | 'gemini';

export interface TranslationUsage {
  provider: TranslationProvider;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  /** Gemini implicit caching does not surface a write line — stays 0. */
  cacheWriteTokens: number;
}

function isProvider(value: string | undefined): value is TranslationProvider {
  return value === 'anthropic' || value === 'gemini';
}

/**
 * Resolve the translation provider. Precedence:
 *   TRANSLATION_PROVIDER → default 'gemini'
 *
 * No per-language override env knob in v1; the daily budget guard on the
 * route handler is the per-language lever. If we ever need to AB on a
 * single language we can add `TRANSLATION_PROVIDER_<LANG>` later — the
 * dispatcher already has the shape for it (see resolveProvider in
 * path-generator-routing.ts:50).
 */
export function resolveTranslationProvider(): TranslationProvider {
  const val = process.env.TRANSLATION_PROVIDER;
  if (isProvider(val)) return val;
  return 'gemini';
}

export interface TranslationCallCtx<T> {
  /** Byte-identical rubric block — cached at the provider level. */
  rubric: string;
  /** Per-(path, language) payload tail. */
  payload: string;
  /** Anthropic tool definition forcing the strict output shape. */
  anthropicTool: Anthropic.Messages.Tool;
  /** Gemini responseSchema mirror of the same shape. */
  geminiSchema?: object;
  /** Default 'Translate now.' — overrideable so retries can carry context. */
  userMessage?: string;
  /** Default 2. Same retry semantics as path-generator-routing. */
  maxAttempts?: number;
  /** Per-attempt usage in normalized shape. */
  onUsage?: (usage: TranslationUsage) => void;
  /** Provider override — wins over env. Used by tests + admin re-run. */
  providerOverride?: TranslationProvider;
  /** Marks the unused generic so callers don't have to widen at use. */
  _phantom?: T;
}

/**
 * Dispatch a structured translation call. The rubric becomes the cached
 * leading block on both providers; the per-call payload is the tail.
 * Anthropic returns the tool input cast to `T`; Gemini returns the
 * parsed JSON cast to `T`. The runner's parse step validates the shape
 * post-hoc so provider parity is the contract.
 */
export async function translationStructuredCall<T>(
  ctx: TranslationCallCtx<T>,
): Promise<{ result: T; provider: TranslationProvider; model: string }> {
  const provider = ctx.providerOverride ?? resolveTranslationProvider();
  const userMessage = ctx.userMessage ?? 'Translate now.';

  if (provider === 'anthropic') {
    // Haiku — matches the per-translation cost target. Sonnet would be
    // overkill for a structural overlay translation and tip past the
    // P0 §7.4 hard ceiling.
    const model = AI_GENERATION_MODEL_LITE;
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

  // Gemini branch — flat systemInstruction with byte-identical leading
  // rubric so implicit caching matches across calls.
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
