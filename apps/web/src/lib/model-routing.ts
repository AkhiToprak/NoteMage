// Central model-routing resolver for the cost-to-performance composition.
//
// Every AI call site asks `resolveModel(feature, ctx)` which model to use,
// instead of hard-coding a constant. The DEFAULTS encode the optimized
// composition from the model audit (cheapest model that clears each feature's
// quality bar). Two escape hatches keep it safe and reversible:
//
//   • MODEL_COMPOSITION_LEGACY=1  — master switch: every feature reverts to the
//     pre-composition ("today's") routing. Instant, total rollback.
//   • per-feature env overrides    — e.g. PATH_QUIZ_MODEL=sonnet, ESSAY_MODEL=…
//     pin one feature to a specific model without touching the rest.
//
// Model ids are NOT duplicated here: each `ModelToken` maps to the canonical id
// exported by anthropic.ts / gemini.ts, so a model version bump is a one-line
// change there. Env override values are TOKENS (haiku|sonnet|flash|flash-lite),
// not raw ids — so an operator can't typo a non-existent model into a knob.

import type { TierKey } from './tiers';
import { AI_GENERATION_MODEL, AI_GENERATION_MODEL_LITE } from './anthropic';
import { GEMINI_PATH_MODEL, GEMINI_PATH_MODEL_LITE, GEMINI_CHAT_MODEL } from './gemini';
import { GLM_HAIKU_MODEL, GLM_SONNET_MODEL } from './openrouter';

export type ModelProvider = 'anthropic' | 'gemini' | 'openrouter';

/** The model slots the composition picks between. `glm-haiku` / `glm-sonnet`
 *  are the OpenRouter/GLM replacements activated by GLM_COMPOSITION (applyGlm). */
export type ModelToken = 'haiku' | 'sonnet' | 'flash' | 'flash-lite' | 'glm-haiku' | 'glm-sonnet';

export interface ResolvedModel {
  provider: ModelProvider;
  /** Concrete model id to pass to the provider SDK. */
  model: string;
  /** Which canonical slot was chosen — handy for telemetry / debugging. */
  token: ModelToken;
}

/** Features the resolver routes. One entry per swap in the plan. */
export type ModelFeature =
  | 'essay'
  | 'path-classify'
  | 'chat-title'
  | 'path-structure'
  | 'path-theory'
  | 'path-flashcards'
  | 'path-quiz'
  | 'path-preview'
  | 'chat-plain'
  | 'chat-generate'
  | 'chat-intent'
  | 'mage-answer'
  | 'inline-rewrite'
  | 'inline-summarize'
  | 'inline-expand'
  | 'doc-summarize'
  | 'page-generate'
  | 'video-ingest'
  // ── Exam Mode (Phase 0) — full-AI, cheap-first. Meter notes per case below. ──
  | 'exam-study-plan'
  | 'exam-mock-questions'
  | 'exam-weak-analysis'
  | 'exam-report-summary';

export interface ResolveModelCtx {
  /** Billing tier — used by tier-sensitive features (chat-plain, essay). */
  tier?: TierKey;
  /** Path generation premium flag (the "ultra path"). */
  ultra?: boolean;
  /** Per-plan force-provider toggle for path generation (plan.gemini). */
  providerOverride?: ModelProvider;
  /** Sub-action discriminator (e.g. essay 'grammar'|'full', inline action). */
  action?: string;
  /** Mage answer depth toggle ('quick'|'deep'|'strict') — picks Haiku vs Sonnet. */
  mode?: string;
}

// ── token → concrete model ────────────────────────────────────────────────

function fromToken(token: ModelToken): ResolvedModel {
  switch (token) {
    case 'haiku':
      return { provider: 'anthropic', model: AI_GENERATION_MODEL_LITE, token };
    case 'sonnet':
      return { provider: 'anthropic', model: AI_GENERATION_MODEL, token };
    case 'flash':
      return { provider: 'gemini', model: GEMINI_PATH_MODEL, token };
    case 'flash-lite':
      return { provider: 'gemini', model: GEMINI_PATH_MODEL_LITE, token };
    case 'glm-haiku':
      return { provider: 'openrouter', model: GLM_HAIKU_MODEL, token };
    case 'glm-sonnet':
      return { provider: 'openrouter', model: GLM_SONNET_MODEL, token };
  }
}

function parseToken(value: string | undefined): ModelToken | null {
  if (!value) return null;
  switch (value.trim().toLowerCase()) {
    case 'haiku':
      return 'haiku';
    case 'sonnet':
      return 'sonnet';
    case 'flash':
      return 'flash';
    case 'flash-lite':
    case 'flashlite':
    case 'flash_lite':
    case 'lite':
      return 'flash-lite';
    case 'glm-haiku':
    case 'glm-4.7':
    case 'glm4.7':
      return 'glm-haiku';
    case 'glm-sonnet':
    case 'glm-5.2':
    case 'glm5.2':
      return 'glm-sonnet';
    default:
      return null;
  }
}

export function isLegacyComposition(): boolean {
  const v = process.env.MODEL_COMPOSITION_LEGACY;
  return v === '1' || v === 'true';
}

/**
 * GLM_COMPOSITION=1 flips every Anthropic DEFAULT slot to its GLM-via-OpenRouter
 * equivalent (haiku→glm-haiku = GLM-4.7, sonnet→glm-sonnet = GLM-5.2). The
 * legacy master switch wins — when MODEL_COMPOSITION_LEGACY is on we revert to
 * today's routing, so it is checked first and disables the GLM swap entirely.
 */
export function isGlmComposition(): boolean {
  if (isLegacyComposition()) return false;
  const v = process.env.GLM_COMPOSITION;
  return v === '1' || v === 'true';
}

/**
 * Redirect a DEFAULT token to its GLM equivalent when GLM_COMPOSITION is on.
 * Applied ONLY to default selection — explicit per-feature env overrides
 * (parseToken results) bypass this, so `PATH_QUIZ_MODEL=haiku` still pins that
 * one slot back to real Claude Haiku while everything else runs on GLM. Gemini
 * tokens (flash / flash-lite) and already-GLM tokens pass through untouched.
 */
function applyGlm(token: ModelToken): ModelToken {
  if (!isGlmComposition()) return token;
  if (token === 'haiku') return 'glm-haiku';
  if (token === 'sonnet') return 'glm-sonnet';
  return token;
}

/** Static (non tier/ultra-sensitive) feature: env token override → legacy/optimized. */
function resolveStatic(
  envName: string,
  legacy: ModelToken,
  optimized: ModelToken,
): ResolvedModel {
  const override = parseToken(process.env[envName]);
  if (override) return fromToken(override);
  return fromToken(applyGlm(isLegacyComposition() ? legacy : optimized));
}

// ── path generation (tier/ultra/override sensitive) ───────────────────────

type PathStage = 'structure' | 'theory' | 'flashcards' | 'quiz';

const PATH_STAGE_MODEL_ENV: Record<PathStage, string> = {
  structure: 'PATH_STRUCTURE_MODEL',
  theory: 'PATH_THEORY_MODEL',
  flashcards: 'PATH_FLASHCARDS_MODEL',
  quiz: 'PATH_QUIZ_MODEL',
};

const PATH_STAGE_PROVIDER_ENV: Record<PathStage, string> = {
  structure: 'PATH_PROVIDER_STRUCTURE',
  theory: 'PATH_PROVIDER_THEORY',
  flashcards: 'PATH_PROVIDER_FLASHCARDS',
  quiz: 'PATH_PROVIDER_QUIZ',
};

const FEATURE_TO_STAGE: Record<
  'path-structure' | 'path-theory' | 'path-flashcards' | 'path-quiz',
  PathStage
> = {
  'path-structure': 'structure',
  'path-theory': 'theory',
  'path-flashcards': 'flashcards',
  'path-quiz': 'quiz',
};

/** Reproduces the pre-composition `resolveProvider` (path-generator-routing.ts)
 *  for LEGACY mode: PATH_PROVIDER_<STAGE> → PATH_PROVIDER → 'anthropic'. */
function legacyPathProvider(stage: PathStage): ModelProvider {
  const stageVal = process.env[PATH_STAGE_PROVIDER_ENV[stage]];
  if (stageVal === 'anthropic' || stageVal === 'gemini') return stageVal;
  const globalVal = process.env.PATH_PROVIDER;
  if (globalVal === 'anthropic' || globalVal === 'gemini') return globalVal;
  return 'anthropic';
}

function resolvePathStage(stage: PathStage, ctx: ResolveModelCtx): ResolvedModel {
  const ultra = ctx.ultra === true;

  // 1. Per-plan force-provider toggle (plan.gemini) — identical in both modes so
  //    the toggle stays predictable. Mirrors the old forcedStructuredCall:
  //    forced gemini → flash; forced anthropic → haiku.
  if (ctx.providerOverride === 'gemini') return fromToken('flash');
  if (ctx.providerOverride === 'anthropic') return fromToken('haiku');

  // 2. Per-stage env token override (e.g. PATH_QUIZ_MODEL=sonnet).
  const tokenOverride = parseToken(process.env[PATH_STAGE_MODEL_ENV[stage]]);
  if (tokenOverride) return fromToken(tokenOverride);

  // 3. LEGACY — exact reproduction of the pre-composition routing.
  if (isLegacyComposition()) {
    if (stage === 'quiz' && ultra) return fromToken('sonnet');
    return fromToken(legacyPathProvider(stage) === 'gemini' ? 'flash' : 'haiku');
  }

  // 4. Path generation runs entirely on GLM-5.2 (validated 2026-06-28: ~half
  //    Claude's cost at better quality, and GLM-4.7's per-call overhead erased
  //    its per-token discount on a many-call workload, so a single flagship
  //    model is both cheaper and simpler than the old GLM-4.7/Gemini mix). All
  //    four stages — structure, theory, flashcards, quiz — resolve to glm-sonnet
  //    for BOTH basic and ultra; the basic/ultra split is by content (corpus
  //    caps, theory visuals), not model. PATH_<STAGE>_MODEL still pins a single
  //    stage (step 2) and MODEL_COMPOSITION_LEGACY=1 reverts to the prior
  //    Anthropic/Gemini routing (step 3) as the rollback.
  return fromToken('glm-sonnet');
}

// ── chat (plain turn only — generation intents stay on Anthropic) ──────────

function resolveChatPlain(ctx: ResolveModelCtx): ResolvedModel {
  // Kill-switch wins over everything — instant "all chat back on Anthropic".
  if (process.env.CHAT_GEMINI_DISABLED === '1') return fromToken('haiku');

  const override = parseToken(process.env.CHAT_PLAIN_MODEL);
  if (override) return fromToken(override);

  if (isLegacyComposition()) {
    // Legacy: FREE → Gemini Flash-Lite (GEMINI_CHAT_MODEL); PRO/admin → Haiku.
    if (ctx.tier && ctx.tier !== 'FREE') return fromToken('haiku');
    if (process.env.CHAT_PROVIDER_FREE === 'anthropic') return fromToken('haiku');
    return { provider: 'gemini', model: GEMINI_CHAT_MODEL, token: 'flash-lite' };
  }

  // Optimized: Flash for BOTH free and pro (cheaper than Haiku, higher quality
  // than Flash-Lite). Generation intents never reach here — they stay Haiku.
  return fromToken('flash');
}

// ── mage answer (grounded/action turn — always Anthropic) ──────────────────

/**
 * Mage Revolution Phase 4. A Mage answer runs Anthropic tools (citations,
 * `annotate_answer`), so it can never route to Gemini regardless of the chat
 * composition. Haiku is the cost-efficient default; `deep` mode upgrades to
 * Sonnet (Phase 9 wires the UI switch). MAGE_ANSWER_MODEL pins the model;
 * MODEL_COMPOSITION_LEGACY keeps the same Haiku default (no legacy regression).
 */
function resolveMageAnswer(ctx: ResolveModelCtx): ResolvedModel {
  const override = parseToken(process.env.MAGE_ANSWER_MODEL);
  if (override) return fromToken(override);
  if (ctx.mode === 'deep') return fromToken(applyGlm('sonnet'));
  return fromToken(applyGlm('haiku'));
}

// ── public entry point ─────────────────────────────────────────────────────

/**
 * Resolve which provider + model a feature's call should use. Defaults encode
 * the optimized composition; `MODEL_COMPOSITION_LEGACY=1` reverts all of them,
 * and each feature has a per-feature env override (see comments per case).
 */
export function resolveModel(
  feature: ModelFeature,
  ctx: ResolveModelCtx = {},
): ResolvedModel {
  switch (feature) {
    case 'essay': {
      // Grammar + full both move Sonnet → Haiku. ESSAY_FULL_MODEL pins the
      // full-mode model independently (e.g. keep Sonnet for deep checks);
      // ESSAY_MODEL is the shared override.
      const isFull = ctx.action === 'full';
      const override =
        (isFull ? parseToken(process.env.ESSAY_FULL_MODEL) : null) ??
        parseToken(process.env.ESSAY_MODEL);
      if (override) return fromToken(override);
      return fromToken(applyGlm(isLegacyComposition() ? 'sonnet' : 'haiku'));
    }

    case 'chat-title':
      return resolveStatic('TITLE_MODEL', 'haiku', 'flash-lite');

    case 'path-classify': {
      // Legacy = Haiku (Anthropic forced tool); optimized = Flash-Lite (Gemini).
      // CLASSIFIER_MODEL (token) wins; else CLASSIFIER_PROVIDER (provider).
      const tokenOverride = parseToken(process.env.CLASSIFIER_MODEL);
      if (tokenOverride) return fromToken(tokenOverride);
      const prov = process.env.CLASSIFIER_PROVIDER?.trim().toLowerCase();
      if (prov === 'anthropic') return fromToken('haiku');
      if (prov === 'gemini') return fromToken('flash-lite');
      return fromToken(applyGlm(isLegacyComposition() ? 'haiku' : 'flash-lite'));
    }

    case 'inline-rewrite':
      return resolveStatic('INLINE_REWRITE_MODEL', 'haiku', 'flash-lite');
    case 'inline-summarize':
      return resolveStatic('INLINE_SUMMARIZE_MODEL', 'haiku', 'flash-lite');
    case 'inline-expand':
      // Expand was the one inline action that hallucinated on the cheap model in
      // the audit — keep it on Haiku in both modes (still env-overridable).
      return resolveStatic('INLINE_EXPAND_MODEL', 'haiku', 'haiku');

    case 'doc-summarize':
      return resolveStatic('DOCSUM_MODEL', 'haiku', 'flash-lite');

    case 'page-generate':
      // Anthropic-only (forced-tool call). PAGE_GENERATE_MODEL env token
      // overrides; MODEL_COMPOSITION_LEGACY=1 keeps Haiku (same as default).
      return resolveStatic('PAGE_GENERATE_MODEL', 'haiku', 'haiku');

    case 'video-ingest': {
      // Gemini-ONLY (D3): Anthropic has no native video ingestion, so this is
      // forced to a Gemini token regardless of MODEL_COMPOSITION_LEGACY or any
      // providerOverride. VIDEO_INGEST_MODEL may pin flash/flash-lite; an
      // Anthropic token (haiku/sonnet) is rejected and falls back to flash.
      const override = parseToken(process.env.VIDEO_INGEST_MODEL);
      if (override === 'flash' || override === 'flash-lite') return fromToken(override);
      return fromToken('flash');
    }

    case 'path-preview':
      // D4 (onboarding-real-generation): the anonymous pre-signup PREVIEW —
      // structure + 1 lesson + 2 questions — runs on Sonnet. It is the
      // make-or-break first impression and only ~3 small calls, so quality wins
      // over cost here. PATH_PREVIEW_MODEL pins it (e.g. =haiku to cut cost);
      // MODEL_COMPOSITION_LEGACY deliberately does NOT downgrade it. Distinct
      // from the FULL completion, which keeps the cheap path-* routing above.
      return resolveStatic('PATH_PREVIEW_MODEL', 'sonnet', 'sonnet');

    case 'chat-plain':
      return resolveChatPlain(ctx);

    case 'chat-generate':
      // In-chat artifact generation (flashcards/quiz/mindmap/… via a forced
      // tool). Was hardcoded to AI_MODEL (Haiku) and bypassed the resolver;
      // now routed so GLM_COMPOSITION flips it to glm-haiku like the other
      // Haiku slots. CHAT_GENERATE_MODEL pins it; legacy == optimized (Haiku).
      return resolveStatic('CHAT_GENERATE_MODEL', 'haiku', 'haiku');

    case 'chat-intent':
      // Per-turn intent gate (forced single-enum tool, runs only on ambiguous
      // turns the heuristic can't resolve). Was hardcoded to AI_CLASSIFIER_MODEL
      // (Haiku); now routed so GLM_COMPOSITION flips it to glm-haiku.
      // CHAT_INTENT_MODEL pins it; legacy == optimized (Haiku).
      return resolveStatic('CHAT_INTENT_MODEL', 'haiku', 'haiku');

    case 'mage-answer':
      return resolveMageAnswer(ctx);

    case 'exam-study-plan':
      // Daily/multi-day task ordering + the "Why this plan" rationale. Structured
      // + short prose, so Flash-Lite suffices; bump via EXAM_STUDY_PLAN_MODEL
      // (e.g. =sonnet) if quality testing fails. Net-new feature → legacy ==
      // optimized. Meter: reuse `ai_study_plan` (reserveUsage at the generator).
      return resolveStatic('EXAM_STUDY_PLAN_MODEL', 'flash-lite', 'flash-lite');

    case 'exam-mock-questions': {
      // Fresh mock questions for the shortfall when scope content is thin. Prefer
      // drawing from existing path quizzes; only the gap is generated. Reuses the
      // path-quiz routing (Gemini basic → Sonnet ultra in legacy / Haiku
      // optimized) so it tracks the same quality bar. EXAM_MOCK_QUESTIONS_MODEL
      // pins it. Meter: reuse `ai_quizzes` (reserveUsage at the generator).
      const override = parseToken(process.env.EXAM_MOCK_QUESTIONS_MODEL);
      if (override) return fromToken(override);
      return resolvePathStage('quiz', ctx);
    }

    case 'exam-weak-analysis':
      // Group weak topics, write per-topic notes + readiness-impact. Cheap
      // grouping/labelling work. Meter: piggybacks the calling surface's meter
      // (no dedicated reserve — runs inside readiness/plan generation).
      return resolveStatic('EXAM_WEAK_ANALYSIS_MODEL', 'haiku', 'flash-lite');

    case 'exam-report-summary':
      // Predicted-vs-actual + recommended-next prose for the post-exam report.
      // Short, cheap. Meter: reuse `ai_study_plan` at the report endpoint.
      return resolveStatic('EXAM_REPORT_MODEL', 'haiku', 'flash-lite');

    case 'path-structure':
    case 'path-theory':
    case 'path-flashcards':
    case 'path-quiz':
      return resolvePathStage(FEATURE_TO_STAGE[feature], ctx);
  }
}
