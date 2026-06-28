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
// NOTE (PA-08): the rubric prefix is ~400 tokens, far below the Haiku 4.5
// minimum (4096 tok) and Gemini implicit cache threshold (~1024 tok).
// Any cache_control marker at this size is a silent no-op. Comments and
// the previously referenced AC-Translate-3 cache gate have been corrected
// to reflect the actual no-cache reality.
//
// PA-30 (injection hardening): untrusted author content (the payload)
// now rides the USER turn, not the system role. System = rubric only.

import type Anthropic from '@anthropic-ai/sdk';
import { AI_GENERATION_MODEL_LITE } from '../anthropic';
import { GEMINI_PATH_MODEL } from '../gemini';
import { forcedStructuredCallAnthropic } from '../path-generator-anthropic';
import {
  forcedStructuredCallGemini,
  type GeminiUsage,
} from '../path-generator-gemini';
import { forcedStructuredCallOpenRouter } from '../path-generator-openrouter';
import { isGlmComposition } from '../model-routing';
import { GLM_HAIKU_MODEL } from '../openrouter';

export type TranslationProvider = 'anthropic' | 'gemini' | 'openrouter';

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
 * Dispatch a structured translation call. The rubric becomes the system
 * instruction on both providers; the per-call payload rides the USER
 * turn wrapped in BEGIN/END UNTRUSTED AUTHOR CONTENT markers (PA-30).
 * Anthropic returns the tool input cast to `T`; Gemini returns the
 * parsed JSON cast to `T`. The runner's parse step validates the shape
 * post-hoc so provider parity is the contract.
 */
export async function translationStructuredCall<T>(
  ctx: TranslationCallCtx<T>,
): Promise<{ result: T; provider: TranslationProvider; model: string }> {
  const provider = ctx.providerOverride ?? resolveTranslationProvider();
  // Wrap the untrusted payload in markers so the model treats it as data.
  const userMessage = [
    'BEGIN UNTRUSTED AUTHOR CONTENT',
    ctx.payload,
    'END UNTRUSTED AUTHOR CONTENT',
    '',
    ctx.userMessage ?? 'Translate now.',
  ].join('\n');

  if (provider === 'anthropic') {
    // GLM_COMPOSITION routes the Haiku-tier translation to GLM-4.7 (forced
    // tool). Only reached when TRANSLATION_PROVIDER=anthropic is explicitly set
    // AND the flag is on — the default Gemini path is untouched.
    if (isGlmComposition()) {
      const model = GLM_HAIKU_MODEL;
      const result = await forcedStructuredCallOpenRouter<T>({
        system: ctx.rubric,
        tool: ctx.anthropicTool,
        userMessage,
        maxAttempts: ctx.maxAttempts,
        model,
        onUsage: (u) =>
          ctx.onUsage?.({
            provider: 'openrouter',
            model,
            inputTokens: u.inputTokens,
            outputTokens: u.outputTokens,
            cacheReadTokens: u.cachedTokens,
            cacheWriteTokens: 0,
          }),
      });
      return { result, provider: 'openrouter', model };
    }
    // Haiku — matches the per-translation cost target. Sonnet would be
    // overkill for a structural overlay translation and tip past the
    // P0 §7.4 hard ceiling.
    // System = rubric only (no untrusted content in the system role).
    // No cache_control: the rubric is ~400 tok, below Haiku's 4096
    // minimum cacheable prefix — the marker was a no-op.
    const model = AI_GENERATION_MODEL_LITE;
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
