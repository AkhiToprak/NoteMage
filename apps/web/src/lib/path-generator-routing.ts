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
import { buildCachedSystem, buildSourceMaterialsBlock, GEMINI_JSON_PREAMBLE } from './path-prompts';
import { forcedStructuredCallAnthropic } from './path-generator-anthropic';
import { forcedStructuredCallGemini, type GeminiUsage } from './path-generator-gemini';
import { resolveModel, type ModelFeature } from './model-routing';
import {
  PATH_STRUCTURE_TOOL,
  THEORY_SECTION_TOOL,
  FLASHCARDS_FOR_SLOT_TOOL,
  QUIZ_FOR_SLOT_TOOL,
} from './ai-tools';

/**
 * All four path tools in a fixed order. Sending a byte-identical `tools`
 * array on every stage call lets the Anthropic prompt cache cover the tools
 * block across stages — `tool_choice` selects the active tool without
 * invalidating the cache.
 */
const PATH_TOOLS_STABLE: Anthropic.Messages.Tool[] = [
  PATH_STRUCTURE_TOOL,
  THEORY_SECTION_TOOL,
  FLASHCARDS_FOR_SLOT_TOOL,
  QUIZ_FOR_SLOT_TOOL,
];

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
  /** Anthropic: cache_creation_input_tokens. Gemini: explicit CachedContent create cost (0 when inline). */
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
    // Stage A is a single call per path — its 1h cache write is never read,
    // so use ephemeral (5-min, 1.25× write) to cover retries only.
    const cacheTtl: '1h' | '5m' = ctx.stage === 'structure' ? '5m' : '1h';
    const system = buildCachedSystem(
      ctx.corpus,
      ctx.staticInstructions,
      ctx.dynamicInstructions,
      cacheTtl,
    );
    return forcedStructuredCallAnthropic<T>({
      system,
      tool: ctx.anthropicTool,
      tools: PATH_TOOLS_STABLE,
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
  //
  // GEMINI_JSON_PREAMBLE is prepended here (not in the builders) because it is
  // Gemini JSON-mode-specific: on the Anthropic path tool_choice forces
  // structured output so the preamble is both redundant and contradictory.
  const cacheablePrefix = [
    GEMINI_JSON_PREAMBLE,
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
  //
  // Stage A (structure) is a single call per path — no benefit from creating an
  // explicit CachedContent for it. Pass it as a flat systemInstruction instead.
  const isStructureStage = ctx.stage === 'structure';
  return forcedStructuredCallGemini<T>({
    ...(isStructureStage
      ? {
          systemInstruction: [cacheablePrefix, ctx.dynamicInstructions]
            .filter((p) => p.length > 0)
            .join('\n\n'),
        }
      : { cacheablePrefix, dynamicTail: ctx.dynamicInstructions }),
    userMessage: ctx.userMessage,
    maxAttempts: ctx.maxAttempts,
    model,
    onUsage: (usage: GeminiUsage) => {
      // `promptTokenCount` includes `cachedContentTokenCount`; subtract to
      // avoid double-billing cached tokens as both input and cache-read.
      const uncachedInput = Math.max(0, usage.promptTokens - usage.cachedTokens);
      ctx.onUsage({
        provider: 'gemini',
        model,
        inputTokens: uncachedInput,
        outputTokens: usage.candidatesTokens,
        cacheReadTokens: usage.cachedTokens,
        cacheWriteTokens: usage.cacheWriteTokens ?? 0,
      });
    },
  });
}
