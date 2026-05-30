// Provider dispatcher for path-generation calls. Sits in front of the
// Anthropic and Gemini wrappers and picks one based on per-stage env
// vars. The activity generators in `path-generator.ts` only see this
// dispatcher — they pass both the Anthropic tool and the Gemini schema
// and let routing decide which is called.
//
// Default routing is Anthropic for every stage, so until the env flips
// runtime behavior is identical to the pre-integration baseline.
//
// `ultra=true` on a quiz call hard-overrides to Anthropic+Sonnet so the
// existing "ultra path" UX continues to work regardless of `PATH_PROVIDER`.

import type Anthropic from '@anthropic-ai/sdk';
import { AI_GENERATION_MODEL, AI_GENERATION_MODEL_LITE } from './anthropic';
import { GEMINI_PATH_MODEL } from './gemini';
import { buildCachedSystem, buildSourceMaterialsBlock } from './path-prompts';
import { forcedStructuredCallAnthropic } from './path-generator-anthropic';
import { forcedStructuredCallGemini, type GeminiUsage } from './path-generator-gemini';

export type Provider = 'anthropic' | 'gemini';
export type Stage = 'structure' | 'theory' | 'flashcards' | 'quiz';

export interface NormalizedUsage {
  provider: Provider;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  /** 0 on the Gemini side in v1 — implicit caching has no separate write line. */
  cacheWriteTokens: number;
}

const STAGE_ENV_KEY: Record<Stage, string> = {
  structure: 'PATH_PROVIDER_STRUCTURE',
  theory: 'PATH_PROVIDER_THEORY',
  flashcards: 'PATH_PROVIDER_FLASHCARDS',
  quiz: 'PATH_PROVIDER_QUIZ',
};

function isProvider(value: string | undefined): value is Provider {
  return value === 'anthropic' || value === 'gemini';
}

/**
 * Resolve the provider for a given stage. Precedence:
 *   PATH_PROVIDER_<STAGE>  →  PATH_PROVIDER  →  default 'anthropic'.
 * Values that don't match `'anthropic'|'gemini'` are ignored and the
 * resolution falls through.
 */
export function resolveProvider(stage: Stage): Provider {
  const stageVal = process.env[STAGE_ENV_KEY[stage]];
  if (isProvider(stageVal)) return stageVal;
  const globalVal = process.env.PATH_PROVIDER;
  if (isProvider(globalVal)) return globalVal;
  return 'anthropic';
}

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
  let provider: Provider;
  if (ctx.providerOverride) {
    provider = ctx.providerOverride;
  } else if (ctx.stage === 'quiz' && ctx.ultra === true) {
    provider = 'anthropic';
  } else {
    provider = resolveProvider(ctx.stage);
  }

  if (provider === 'anthropic') {
    // Only upgrade to Sonnet when the ultra flag asks for it AND no
    // explicit override pushed us onto Anthropic for some other reason.
    const isUltraQuiz =
      !ctx.providerOverride && ctx.stage === 'quiz' && ctx.ultra === true;
    const model = isUltraQuiz ? AI_GENERATION_MODEL : AI_GENERATION_MODEL_LITE;
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

  // Gemini branch — concatenate the same corpus block text as Anthropic
  // uses (byte-identical so implicit caching matches across calls). Gemini
  // has no explicit cache split, but keeping the static prefix ahead of the
  // dynamic tail still helps its implicit cache.
  const model = GEMINI_PATH_MODEL;
  const systemInstruction = [
    ctx.corpus && ctx.corpus.trim().length > 0
      ? buildSourceMaterialsBlock(ctx.corpus)
      : null,
    ctx.staticInstructions,
    ctx.dynamicInstructions,
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
    systemInstruction,
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
