// Provider dispatcher for path-generation calls. Sits in front of the
// Anthropic and Gemini wrappers; `resolveModel` (model-routing.ts) decides
// which provider + model each stage uses. The activity generators in
// `path-generator.ts` only see this dispatcher — they pass both the Anthropic
// tool and the Gemini schema and let routing decide which is called.
//
// Default routing is the optimized composition (structure: Flash basic /
// Sonnet ultra; theory + flashcards: Flash-Lite; quiz: Haiku for all tiers).
// `MODEL_COMPOSITION_LEGACY=1` reverts to the prior PATH_PROVIDER_* routing
// with the ultra→Sonnet quiz upgrade. `ctx.ultra` and `ctx.providerOverride`
// (plan.gemini) are forwarded to the resolver.

import type Anthropic from '@anthropic-ai/sdk';
import { buildCachedSystem, buildSourceMaterialsBlock } from './path-prompts';
import { forcedStructuredCallAnthropic } from './path-generator-anthropic';
import { forcedStructuredCallGemini, type GeminiUsage } from './path-generator-gemini';
import { resolveModel, type ModelFeature } from './model-routing';

export type Provider = 'anthropic' | 'gemini';
export type Stage = 'structure' | 'theory' | 'flashcards' | 'quiz';

/** Map a pipeline stage to its routing feature key. */
const STAGE_FEATURE: Record<Stage, ModelFeature> = {
  structure: 'path-structure',
  theory: 'path-theory',
  flashcards: 'path-flashcards',
  quiz: 'path-quiz',
};

export interface NormalizedUsage {
  provider: Provider;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  /** 0 on the Gemini side in v1 — implicit caching has no separate write line. */
  cacheWriteTokens: number;
}

// Stage→provider/model resolution moved to model-routing.ts (`resolveModel`),
// which owns both the optimized composition and the LEGACY reproduction of the
// old PATH_PROVIDER_<STAGE> → PATH_PROVIDER → 'anthropic' precedence.

export interface StructuredCallCtx<T> {
  /** Pipeline stage — drives provider resolution + Anthropic model tier. */
  stage: Stage;
  /** Raw corpus text. Null/empty means no source materials are attached. */
  corpus: string | null;
  /** Per-path-constant rule text (the `system` half of buildXxxPrompt) — the
   *  cacheable prefix billed ~once per path. */
  staticInstructions: string;
  /** Per-slot/per-phase dynamic text (the `tail` half of buildXxxPrompt) plus
   *  any retry/corrective notices — left uncached so the prefix stays stable. */
  dynamicInstructions: string;
  /** Anthropic tool definition for the call. */
  anthropicTool: Anthropic.Messages.Tool;
  /** Gemini `responseSchema` — optional, when omitted only JSON mode is set. */
  geminiSchema?: object;
  /** User-turn message — usually 'Generate now.' or a corrective notice on retry. */
  userMessage: string;
  /** Max attempts at the call level. Default 2 (matches the existing pattern). */
  maxAttempts?: number;
  /** Per-attempt usage callback. The dispatcher converts each provider's
   *  native usage shape into the unified `NormalizedUsage`. */
  onUsage: (usage: NormalizedUsage) => void;
  /** When true on a quiz call, forces Anthropic+Sonnet regardless of env —
   *  preserves the existing "ultra path" behavior. */
  ultra?: boolean;
  /** Per-call provider override. Wins over both `ultra` and the env-var
   *  resolver — set it from `plan.gemini=true` to force every stage
   *  through Gemini for one specific generation. */
  providerOverride?: Provider;
  /** Mark the unused generic so callers don't have to widen at consumption. */
  _phantom?: T;
}

/**
 * Dispatch a structured-output call to the resolved provider. Returns
 * the parsed payload typed as `T`; downstream Zod validators (the same
 * for both providers) enforce the strict shape.
 *
 * Resolution order:
 *   1. `providerOverride` (per-plan opt-in, e.g. the Gemini test toggle).
 *   2. `ultra=true` on a quiz call → Anthropic+Sonnet.
 *   3. env-var routing (`PATH_PROVIDER_<STAGE>` then `PATH_PROVIDER`).
 *   4. default `'anthropic'`.
 */
export async function forcedStructuredCall<T>(ctx: StructuredCallCtx<T>): Promise<T> {
  // Provider + model both come from the central resolver. Defaults encode the
  // optimized composition (structure: Flash basic / Sonnet ultra; theory +
  // flashcards: Flash-Lite; quiz: Haiku all tiers). MODEL_COMPOSITION_LEGACY=1
  // reverts to the prior routing; PATH_<STAGE>_MODEL pins a single stage; and
  // `providerOverride` (plan.gemini) still forces a provider for one run.
  const resolved = resolveModel(STAGE_FEATURE[ctx.stage], {
    ultra: ctx.ultra,
    providerOverride: ctx.providerOverride,
  });
  const provider = resolved.provider;
  const model = resolved.model;

  if (provider === 'anthropic') {
    const system = buildCachedSystem(
      ctx.corpus,
      ctx.staticInstructions,
      ctx.dynamicInstructions,
    );
    return forcedStructuredCallAnthropic<T>({
      system,
      tool: ctx.anthropicTool,
      userMessage: ctx.userMessage,
      maxAttempts: ctx.maxAttempts,
      model,
      onUsage: (usage) =>
        ctx.onUsage({
          provider: 'anthropic',
          model,
          inputTokens: usage.input_tokens,
          outputTokens: usage.output_tokens,
          cacheReadTokens: usage.cache_read_input_tokens ?? 0,
          cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
        }),
    });
  }

  // Gemini branch — split the prompt into the per-path-constant prefix
  // (corpus + stage rules) and the per-call dynamic tail. The wrapper backs
  // the prefix with an explicit CachedContent resource (basic tier runs on
  // Gemini, so this is the high-volume cost path) and otherwise falls back to
  // an inline, byte-identical systemInstruction. The corpus block leads so the
  // prefix is byte-identical across a run's calls (cache + implicit-cache match).
  const cacheablePrefix = [
    ctx.corpus && ctx.corpus.trim().length > 0 ? buildSourceMaterialsBlock(ctx.corpus) : null,
    ctx.staticInstructions,
  ]
    .filter((part): part is string => Boolean(part && part.length > 0))
    .join('\n\n');

  // `responseSchema` deliberately omitted from the SDK call — Gemini's
  // constrained-decoding rejects the path-structure schema as "too many
  // states for serving" because of nested arrays with min/max bounds and
  // multi-value enums. The strict shape lives in the system prompt
  // (`buildXxxPrompt`) and is enforced post-hoc by the same Zod
  // validators the Anthropic path uses — matches the existing Gemini
  // pattern in `engine-gemini.ts` and `subject-detect.ts`. The schemas
  // in `ai-tools-gemini.ts` stay for documentation / future re-enable
  // once Gemini relaxes the constraint.
  return forcedStructuredCallGemini<T>({
    cacheablePrefix,
    dynamicTail: ctx.dynamicInstructions,
    userMessage: ctx.userMessage,
    maxAttempts: ctx.maxAttempts,
    model,
    onUsage: (usage: GeminiUsage) =>
      ctx.onUsage({
        provider: 'gemini',
        model,
        inputTokens: usage.promptTokens,
        outputTokens: usage.candidatesTokens,
        cacheReadTokens: usage.cachedTokens,
        cacheWriteTokens: 0,
      }),
  });
}
