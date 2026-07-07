// Provider dispatcher for path-generation calls. Sits in front of the GLM
// (OpenRouter) and Gemini wrappers; `resolveModel` (model-routing.ts) decides
// which provider + model each stage uses. The activity generators in
// `path-generator.ts` only see this dispatcher — they pass the tool def and the
// Gemini schema and let routing decide which is called.
//
// Default routing is the optimized composition (structure + theory: GLM-5.2;
// flashcards + quiz: GLM-4.7-flash basic / GLM-5.2 ultra). `ctx.ultra` and
// `ctx.providerOverride` are forwarded to the resolver. Claude is gone — the
// resolver only ever returns 'gemini' or 'openrouter'.

import type { ToolDef } from './ai-tool-types';
import { buildSourceMaterialsBlock, GEMINI_JSON_PREAMBLE } from './path-prompts';
import { forcedStructuredCallGemini, type GeminiUsage } from './path-generator-gemini';
import { forcedStructuredCallOpenRouter } from './path-generator-openrouter';
import { resolveModel, type ModelFeature } from './model-routing';

export type Provider = 'gemini' | 'openrouter';
export type Stage = 'structure' | 'theory' | 'flashcards' | 'quiz';

/** Map a pipeline stage to its routing feature key. */
const STAGE_FEATURE: Record<Stage, ModelFeature> = {
  structure: 'path-structure',
  theory: 'path-theory',
  flashcards: 'path-flashcards',
  quiz: 'path-quiz',
};

/**
 * Parse `PATH_STRUCTURE_REASONING` into a valid OpenRouter reasoning effort,
 * or `null` when unset/invalid. Pure + exported so it's unit-testable without
 * touching `process.env` plumbing or any provider call.
 */
export function parseStructureReasoningEffort(
  raw: string | undefined,
): 'low' | 'medium' | 'high' | null {
  const normalized = raw?.trim().toLowerCase();
  if (normalized === 'low' || normalized === 'medium' || normalized === 'high') {
    return normalized;
  }
  return null;
}

export interface NormalizedUsage {
  provider: Provider;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  /** Gemini: explicit CachedContent create cost (0 when inline). GLM caches the
   *  prefix implicitly, so this is 0 on the OpenRouter path. */
  cacheWriteTokens: number;
  /** OpenRouter only: the real USD cost OpenRouter bills inline for this call.
   *  Undefined for the Gemini path (cost is derived from tokens). Phase 5 wires
   *  this straight into the meter instead of re-deriving from token pricing. */
  costUsd?: number;
}

// Stage→provider/model resolution lives in model-routing.ts (`resolveModel`),
// which owns the composition. The old PATH_PROVIDER_<STAGE> / PATH_PROVIDER env
// vars are retired and ignored — the resolver only returns 'gemini' or 'openrouter'.

export interface StructuredCallCtx<T> {
  /** Pipeline stage — drives provider resolution + model tier. */
  stage: Stage;
  /** Raw corpus text. Null/empty means no source materials are attached. */
  corpus: string | null;
  /** Per-path-constant rule text (the `system` half of buildXxxPrompt) — the
   *  cacheable prefix billed ~once per path. */
  staticInstructions: string;
  /** Per-slot/per-phase dynamic text (the `tail` half of buildXxxPrompt) plus
   *  any retry/corrective notices — left uncached so the prefix stays stable. */
  dynamicInstructions: string;
  /** Forced tool definition for the call (the field name is a legacy anchor —
   *  the shape is the codebase's own, formerly Anthropic-shaped). */
  anthropicTool: ToolDef;
  /**
   * Override the `tools` array sent on the call. Defaults to the four
   * stable path tools (`PATH_TOOLS_STABLE`). The forced `anthropicTool` MUST be
   * present in whatever array is sent, so a call forcing a tool OUTSIDE the four
   * (e.g. the onboarding preview-questions tool) supplies its own single-tool
   * array here. Ignored on the Gemini branch (it never sends tools).
   */
  anthropicTools?: ToolDef[];
  /**
   * Resolve the model against a DIFFERENT feature key than the stage's default
   * (e.g. `'path-preview'` → GLM-5.2, the former Sonnet slot, for the anonymous
   * onboarding preview). The `stage` still drives cache TTL + the Gemini prefix
   * shape; only the model picked changes. Omit for normal Stage A/B calls.
   */
  featureOverride?: ModelFeature;
  /** User-turn message — usually 'Generate now.' or a corrective notice on retry. */
  userMessage: string;
  /** Max attempts at the call level. Default 2 (matches the existing pattern). */
  maxAttempts?: number;
  /** Per-call output-token ceiling. Omit ⇒ the provider default (GLM 32k /
   *  Gemini 16k). Small forced-tool outputs (weakness/practice sessions) pass a
   *  tight value so the call isn't dispatched at the full ceiling. Clamped by
   *  each provider's own max (openRouterMaxCompletionTokens on OpenRouter). */
  maxTokens?: number;
  /** Sampling temperature for this call. Undefined ⇒ provider default (~1.0).
   *  Forwarded to both the OpenRouter and Gemini branches — the caller
   *  (path-generator.ts) sets a low per-stage value so structured tool output
   *  is deterministic rather than sampled hot. */
  temperature?: number;
  /** Per-attempt usage callback. The dispatcher converts each provider's
   *  native usage shape into the unified `NormalizedUsage`. */
  onUsage: (usage: NormalizedUsage) => void;
  /** When true on a quiz call, forces the ultra slot (GLM-5.2, the former Sonnet
   *  slot) regardless of env — preserves the existing "ultra path" behavior. */
  ultra?: boolean;
  /** Per-call provider override. Wins over both `ultra` and the env-var
   *  resolver — set it from `plan.gemini=true` to force every stage
   *  through Gemini for one specific generation. */
  providerOverride?: Provider;
  /** OpenRouter sticky-routing token (X-Session-Id). One per runPathGeneration,
   *  stable across all its calls + sweeps, so they land on the same upstream and
   *  the corpus prefix cache actually hits. Ignored on the Gemini branch. */
  sessionId?: string;
  /** Mark the unused generic so callers don't have to widen at consumption. */
  _phantom?: T;
}

/**
 * Dispatch a structured-output call to the resolved provider. Returns
 * the parsed payload typed as `T`; downstream Zod validators (the same
 * for both providers) enforce the strict shape.
 *
 * The resolver returns only 'openrouter' (GLM, the default for every stage) or
 * 'gemini' (a per-stage env pin). Claude is gone — there is no anthropic branch
 * and no GLM→Claude fallback.
 */
export async function forcedStructuredCall<T>(ctx: StructuredCallCtx<T>): Promise<T> {
  // Provider + model both come from the central resolver. Defaults encode the
  // optimized composition (structure + theory: GLM-5.2; flashcards + quiz:
  // GLM-4.7-flash basic / GLM-5.2 ultra). PATH_<STAGE>_MODEL pins a single
  // stage; `providerOverride` forces a provider for one run.
  const resolved = resolveModel(ctx.featureOverride ?? STAGE_FEATURE[ctx.stage], {
    ultra: ctx.ultra,
    providerOverride: ctx.providerOverride,
  });
  const provider = resolved.provider;
  const model = resolved.model;

  if (provider === 'openrouter') {
    // GLM via OpenRouter (the default for every stage). Structured output goes
    // through FORCED TOOLS — json_schema is flaky on GLM-4.7; the reused tool
    // defs are translated to OpenAI shape inside the wrapper. No cache_control: GLM
    // caches the prefix implicitly, so lead with corpus + static rules and keep
    // the dynamic tail last (mirrors the Gemini prefix ordering below). The
    // Gemini JSON preamble is omitted — tool_choice forces the structure.
    const system = [
      ctx.corpus && ctx.corpus.trim().length > 0 ? buildSourceMaterialsBlock(ctx.corpus) : null,
      ctx.staticInstructions,
      ctx.dynamicInstructions,
    ]
      .filter((part): part is string => Boolean(part && part.length > 0))
      .join('\n\n');
    // NO CLAUDE FALLBACK. Path generation runs GLM-only. A Claude net just
    // masked GLM failures at $3–15/M while making them invisible — and the two
    // failures we actually saw were OURS to fix, not GLM's: (1) a stringified
    // `questions` array we were dropping (fixed in normalizeQuizQuestions), and
    // (2) output truncation at the cap (fixed by the higher GLM_MAX_OUTPUT_TOKENS
    // headroom in path-generator-openrouter.ts). forcedStructuredCallOpenRouter
    // already retries transient OpenRouter blips internally with backoff, and the
    // activity/sweep layer retries on GLM again — so a thrown error here means
    // GLM genuinely could not produce valid output, and the right outcome is to
    // surface that (activity_failed → sweep retry on GLM), never to spend Claude.
    // Phase 7 experiment: reasoning stays OFF everywhere by default (unchanged
    // request body — see forcedStructuredCallOpenRouter). PATH_STRUCTURE_REASONING
    // opts a single call class back into reasoning: the ONE Stage A structure
    // call per path, never Stage B fill (theory/flashcards/quiz run many calls
    // per path, and reasoning risks eating the output budget before the tool
    // call lands — see the finish_reason='length' guard) and never a
    // featureOverride call (e.g. 'path-preview', which needs deterministic
    // low-latency output, not planning). Read the env var at call time, not
    // module scope, so scripts (test-glm-ab.ts) can toggle it per run.
    const reasoningEffort =
      ctx.stage === 'structure' && !ctx.featureOverride
        ? parseStructureReasoningEffort(process.env.PATH_STRUCTURE_REASONING) ?? undefined
        : undefined;
    return await forcedStructuredCallOpenRouter<T>({
      system,
      tool: ctx.anthropicTool,
      // GLM/OpenRouter: send ONLY the forced tool, not the 4-tool stable array.
      // GLM's implicit cache keys on the SYSTEM-PROMPT prefix, not the tools
      // block, so the byte-stable 4-tool array (which the retired Anthropic
      // prompt cache needed) is pure token waste here — 3 unused tool schemas ×
      // every call. An explicit `anthropicTools` override (e.g. the onboarding
      // preview tool) is still honored.
      tools: ctx.anthropicTools ?? [ctx.anthropicTool],
      userMessage: ctx.userMessage,
      maxAttempts: ctx.maxAttempts,
      maxTokens: ctx.maxTokens,
      model,
      sessionId: ctx.sessionId,
      reasoningEffort,
      temperature: ctx.temperature,
      onUsage: (usage) =>
        ctx.onUsage({
          provider: 'openrouter',
          model,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          cacheReadTokens: usage.cachedTokens,
          cacheWriteTokens: 0,
          costUsd: usage.costUsd,
        }),
    });
  }

  // Safety guard (Phase 3 group 5): only Gemini should remain. Throw on any
  // unhandled provider rather than silently routing it through Gemini — the
  // resolver only ever returns 'openrouter' (handled above) or 'gemini'.
  if (provider !== 'gemini') {
    throw new Error(`forcedStructuredCall: unhandled provider '${provider as string}'`);
  }

  // Gemini branch — split the prompt into the per-path-constant prefix
  // (corpus + stage rules) and the per-call dynamic tail. The wrapper backs
  // the prefix with an explicit CachedContent resource (basic tier runs on
  // Gemini, so this is the high-volume cost path) and otherwise falls back to
  // an inline, byte-identical systemInstruction. The corpus block leads so the
  // prefix is byte-identical across a run's calls (cache + implicit-cache match).
  //
  // GEMINI_JSON_PREAMBLE is prepended here (not in the builders) because it is
  // Gemini JSON-mode-specific: on the GLM/OpenRouter path tool_choice forces
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
  // validators the GLM/OpenRouter path uses — matches the existing Gemini
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
    maxOutputTokens: ctx.maxTokens,
    model,
    temperature: ctx.temperature,
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
