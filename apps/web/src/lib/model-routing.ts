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
// change there. Env override values are TOKENS (haiku|sonnet|flash|flash-lite|
// glm-haiku|glm-sonnet|glm-flash|deepseek-flash), not raw ids — so an operator
// can't typo a non-existent model into a knob.

import type { TierKey } from './tiers';
import { AI_GENERATION_MODEL, AI_GENERATION_MODEL_LITE } from './anthropic';
import { GEMINI_PATH_MODEL, GEMINI_PATH_MODEL_LITE, GEMINI_CHAT_MODEL } from './gemini';
import {
  DEEPSEEK_FLASH_MODEL,
  GLM_FLASH_MODEL,
  GLM_HAIKU_MODEL,
  GLM_SONNET_MODEL,
  OPENROUTER_GEMINI_FLASH_LITE_MODEL,
} from './openrouter';

export type ModelProvider = 'anthropic' | 'gemini' | 'openrouter';

/** The model slots the composition picks between. `glm-haiku` / `glm-sonnet`
 *  are the OpenRouter/GLM replacements activated by GLM_COMPOSITION (applyGlm);
 *  `glm-flash` is the cheap GLM tier (4.7-flash) backing the high-volume
 *  structured slots. `deepseek-flash` (deepseek-v4-flash, 1M ctx) is PIN-ONLY —
 *  no default routes to it; it exists so a per-feature env pin (e.g.
 *  PATH_THEORY_MODEL=deepseek-flash) can run an experiment without a deploy. */
export type ModelToken =
  | 'haiku'
  | 'sonnet'
  | 'flash'
  | 'flash-lite'
  | 'glm-haiku'
  | 'glm-sonnet'
  | 'glm-flash'
  | 'or-flash-lite'
  | 'deepseek-flash';

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
  | 'quiz-verify'
  | 'path-preview'
  | 'chat-plain'
  | 'chat-generate'
  | 'chat-intent'
  | 'mage-answer'
  | 'doc-summarize'
  | 'page-generate'
  | 'video-ingest'
  // ── Exam Mode (Phase 0) — full-AI, cheap-first. Meter notes per case below. ──
  | 'exam-study-plan'
  | 'exam-mock-questions'
  | 'exam-weak-analysis'
  | 'exam-report-summary'
  // Weakness Training Phase 1A (§3.3, §5.1) — one slot's items per call,
  // closed-enum concept classification for the backfill job. Cheap tier,
  // same routing as `exam-weak-analysis`.
  | 'concept-backfill-classify'
  // Weakness Training Phase 1B (§5.1) — ONE forced-tool remediation session
  // per call. Same tier as `exam-mock-questions` (path-quiz routing).
  | 'weakness-session-generate'
  // Weakness Training Phase 3 (§2.3 tier 2 / §5.1) — one de-personalised
  // misconception line per call, fired async/batched/hysteresis-gated (a
  // weak-band transition, re-checked at job time, once per concept per
  // 7-day cooldown). Cheap tier, same routing as `concept-backfill-classify`.
  | 'weakness-misconception-tag';

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
    case 'glm-flash':
      return { provider: 'openrouter', model: GLM_FLASH_MODEL, token };
    case 'or-flash-lite':
      return { provider: 'openrouter', model: OPENROUTER_GEMINI_FLASH_LITE_MODEL, token };
    case 'deepseek-flash':
      return { provider: 'openrouter', model: DEEPSEEK_FLASH_MODEL, token };
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
    case 'glm-flash':
    case 'glm-4.7-flash':
    case 'glm4.7-flash':
      return 'glm-flash';
    case 'deepseek-flash':
    case 'deepseek-v4-flash':
    case 'deepseek':
      return 'deepseek-flash';
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

  // 1. The legacy plan.gemini / providerOverride force-toggle is RETIRED. Path
  //    generation no longer routes to Gemini in normal operation — every stage
  //    runs on GLM-5.2 (step 4). providerOverride is intentionally ignored so a
  //    stray `gemini:true` on a request can never put a path back on Gemini.
  //    (Gemini is still reachable ONLY via MODEL_COMPOSITION_LEGACY=1 → step 3,
  //    the explicit rollback; a GLM failure falls back to Claude in
  //    forcedStructuredCall, never Gemini.)

  // 2. Per-stage env token override (e.g. PATH_QUIZ_MODEL=sonnet).
  const tokenOverride = parseToken(process.env[PATH_STAGE_MODEL_ENV[stage]]);
  if (tokenOverride) return fromToken(tokenOverride);

  // 3. LEGACY — exact reproduction of the pre-composition routing.
  if (isLegacyComposition()) {
    // SONNET REMOVED: legacy ultra-quiz used to upgrade to Sonnet — now Haiku.
    if (stage === 'quiz' && ultra) return fromToken('haiku');
    return fromToken(legacyPathProvider(stage) === 'gemini' ? 'flash' : 'haiku');
  }

  // 4. Structure + theory stay on GLM-5.2 (the quality surfaces: one structure
  //    call sets the whole path, theory prose is the product). Flashcards +
  //    quiz — the per-slot volume stages — run on GLM-4.7-flash for BASIC
  //    paths (live catalog 2026-07-02: $0.06/$0.40 vs 5.2's $0.93/$3.00, cache
  //    reads 18× cheaper; same forced-tool shape + Zod validation + repair
  //    loop). ULTRA keeps GLM-5.2 on those stages: the 600k-char ultra corpus
  //    can exceed flash's 203K window on dense material, and ultra is 3/mo
  //    capped so its spend is bounded — basic ("unlimited"/mo) is where the
  //    flash price matters. PATH_<STAGE>_MODEL still pins a single stage
  //    (step 2) and MODEL_COMPOSITION_LEGACY=1 reverts to the prior
  //    Anthropic/Gemini routing (step 3) as the rollback.
  if ((stage === 'flashcards' || stage === 'quiz') && !ultra) return fromToken('glm-flash');
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

  // Optimized: FREE → Flash-Lite (50-msg/mo meter; keeps per-free-user AI COGS
  // at the unit-economics floor), PRO/admin → Flash. Generation intents never
  // reach here — they route via chat-generate.
  if (ctx.tier && ctx.tier !== 'FREE') return fromToken('flash');
  return fromToken('flash-lite');
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
  // Mage runs on GLM (flag-independent, like path generation): GLM-4.7 for
  // normal answers, GLM-5.2 for `deep`. MODEL_COMPOSITION_LEGACY=1 reverts to
  // Claude (Haiku / Sonnet by mode) as the rollback; chat-stream falls back to
  // Claude automatically on a GLM failure, so Mage never breaks.
  // SONNET REMOVED: legacy deep-mode Mage used to use Sonnet — now Haiku.
  if (isLegacyComposition()) return fromToken('haiku');
  return fromToken(ctx.mode === 'deep' ? 'glm-sonnet' : 'glm-haiku');
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
      // SONNET + HAIKU REMOVED: grammar + full both run on GLM-4.7 (glm-haiku);
      // MODEL_COMPOSITION_LEGACY=1 reverts to Claude Haiku. ESSAY_FULL_MODEL /
      // ESSAY_MODEL still override per call if a stronger model is ever needed.
      const isFull = ctx.action === 'full';
      const override =
        (isFull ? parseToken(process.env.ESSAY_FULL_MODEL) : null) ??
        parseToken(process.env.ESSAY_MODEL);
      if (override) return fromToken(override);
      return fromToken(isLegacyComposition() ? 'haiku' : 'glm-haiku');
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

    case 'doc-summarize':
      return resolveStatic('DOCSUM_MODEL', 'haiku', 'flash-lite');

    case 'page-generate':
      // GLM-4.7 default (Haiku removed app-wide); PAGE_GENERATE_MODEL env token
      // overrides; MODEL_COMPOSITION_LEGACY=1 reverts to Claude Haiku.
      return resolveStatic('PAGE_GENERATE_MODEL', 'haiku', 'glm-haiku');

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
      // structure + 1 lesson + 2 questions — the make-or-break first impression.
      // SONNET REMOVED (cost): runs on GLM-5.2 — the same flagship that replaced
      // Sonnet for full path gen, so quality holds without the Sonnet bill. The
      // dispatcher (forcedStructuredCall) falls back to Haiku, never Sonnet, if
      // GLM is unavailable. PATH_PREVIEW_MODEL still pins it (e.g. =haiku to go
      // cheaper). Distinct from the FULL completion's cheap path-* routing above.
      return resolveStatic('PATH_PREVIEW_MODEL', 'glm-sonnet', 'glm-sonnet');

    case 'chat-plain':
      return resolveChatPlain(ctx);

    case 'chat-generate':
      // In-chat artifact generation (flashcards/quiz/mindmap/… via a forced
      // tool). Defaults to GLM-4.7-flash (glm-flash): forced-tool structured
      // output at ~1/7 of GLM-4.7's price, and the chat GLM stream path sends
      // max_tokens ≤ 4096 — well under flash's 16,384 completion cap. The
      // chat-stream dispatch branches on provider, so this routes straight to
      // OpenRouter. CHAT_GENERATE_MODEL pins it; MODEL_COMPOSITION_LEGACY=1
      // reverts to Claude Haiku.
      return resolveStatic('CHAT_GENERATE_MODEL', 'haiku', 'glm-flash');

    case 'chat-intent':
      // Per-turn intent gate (forced single-enum tool, runs only on ambiguous
      // turns the heuristic can't resolve). Defaults to GLM-4.7-flash
      // (glm-flash) — a tiny forced-enum call on the cheapest reliable
      // tool-calling tier. chat-intent dispatches on provider (openrouter →
      // forced callOpenRouter). CHAT_INTENT_MODEL pins it;
      // MODEL_COMPOSITION_LEGACY=1 reverts to Claude Haiku.
      return resolveStatic('CHAT_INTENT_MODEL', 'haiku', 'glm-flash');

    case 'mage-answer':
      return resolveMageAnswer(ctx);

    case 'quiz-verify':
      // Independent, narrow quality check. Always Gemini 2.5 Flash-Lite via
      // OpenRouter—not Google-direct—so its exact billed cost is captured.
      return fromToken('or-flash-lite');

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

    case 'concept-backfill-classify':
      // One slot's items (typically 5-15) per call — closed-enum concept
      // candidates + per-item conceptKeys, mirroring exam-weak-analysis's
      // cheap grouping/labelling tier. CONCEPT_BACKFILL_MODEL pins it.
      return resolveStatic('CONCEPT_BACKFILL_MODEL', 'haiku', 'flash-lite');

    case 'weakness-misconception-tag':
      // One de-personalised misconception line per call — short, cheap,
      // batched/async/hysteresis-gated (§2.3 tier 2). Same cheap tier as
      // concept-backfill-classify/exam-weak-analysis. WEAKNESS_MISCONCEPTION_MODEL pins it.
      return resolveStatic('WEAKNESS_MISCONCEPTION_MODEL', 'haiku', 'flash-lite');

    case 'weakness-session-generate': {
      // Weakness Training Phase 1B (§5.1) — ONE forced-tool remediation session
      // per call. Same tier as exam-mock-questions (path-quiz routing → glm-sonnet).
      // WEAKNESS_SESSION_MODEL pins it. Meter: reuse `ai_quizzes` at the route.
      const override = parseToken(process.env.WEAKNESS_SESSION_MODEL);
      if (override) return fromToken(override);
      return resolvePathStage('quiz', ctx);
    }

    case 'path-structure':
    case 'path-theory':
    case 'path-flashcards':
    case 'path-quiz':
      return resolvePathStage(FEATURE_TO_STAGE[feature], ctx);
  }
}
