// Central model-routing resolver for the cost-to-performance composition.
//
// Every AI call site asks `resolveModel(feature, ctx)` which model to use,
// instead of hard-coding a constant. The DEFAULTS encode the optimized
// composition from the model audit (cheapest model that clears each feature's
// quality bar). One escape hatch remains: per-feature env overrides (e.g.
// PATH_QUIZ_MODEL=glm-sonnet, ESSAY_MODEL=…) pin one feature to a specific
// model without touching the rest.
//
// Anthropic/Claude has been fully removed — path gen + Mage + chat run on GLM
// (via OpenRouter), classify/title/summarize run on Gemini. The `haiku` /
// `sonnet` env tokens are still ACCEPTED (old operator pins keep working) but
// they now resolve to their GLM equivalents (glm-haiku / glm-sonnet).
//
// Model ids are NOT duplicated here: each `ModelToken` maps to the canonical id
// exported by gemini.ts / openrouter.ts, so a model version bump is a one-line
// change there. Env override values are TOKENS (haiku|sonnet|flash|flash-lite|
// glm-haiku|glm-sonnet|glm-flash|deepseek-flash), not raw ids — so an operator
// can't typo a non-existent model into a knob.

import type { TierKey } from './tiers';
import { GEMINI_PATH_MODEL, GEMINI_PATH_MODEL_LITE, GEMINI_CHAT_MODEL } from './gemini';
import {
  DEEPSEEK_FLASH_MODEL,
  GLM_FLASH_MODEL,
  GLM_HAIKU_MODEL,
  GLM_SONNET_MODEL,
  OPENROUTER_GEMINI_FLASH_LITE_MODEL,
} from './openrouter';

export type ModelProvider = 'gemini' | 'openrouter';

/** The model slots the composition picks between. `glm-haiku` / `glm-sonnet`
 *  are the GLM-4.7 / GLM-5.2 slots (OpenRouter) that replaced Claude Haiku /
 *  Sonnet; `glm-flash` is the cheap GLM tier (4.7-flash) backing the
 *  high-volume structured slots. `deepseek-flash` (deepseek-v4-flash, 1M ctx)
 *  is PIN-ONLY — no default routes to it; it exists so a per-feature env pin
 *  (e.g. PATH_THEORY_MODEL=deepseek-flash) can run an experiment without a
 *  deploy. */
export type ModelToken =
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
  /** Mage answer depth toggle ('quick'|'deep'|'strict') — picks GLM-4.7 vs 5.2. */
  mode?: string;
}

// ── retired env-var warning (one lazy check) ───────────────────────────────

/** Env vars that used to steer routing and are now ignored. Set one and you get
 *  a single startup warning so an operator isn't silently surprised. */
const RETIRED_ENV_VARS = [
  'MODEL_COMPOSITION_LEGACY',
  'GLM_COMPOSITION',
  'PATH_PROVIDER',
  'PATH_PROVIDER_STRUCTURE',
  'PATH_PROVIDER_THEORY',
  'PATH_PROVIDER_FLASHCARDS',
  'PATH_PROVIDER_QUIZ',
  'CHAT_PROVIDER_FREE',
  'CLASSIFIER_PROVIDER',
];

let retiredEnvChecked = false;
/** Lazily warn (once per process) if any retired routing env var is still set. */
function warnRetiredEnvOnce(): void {
  if (retiredEnvChecked) return;
  retiredEnvChecked = true;
  for (const name of RETIRED_ENV_VARS) {
    if (process.env[name] !== undefined && process.env[name] !== '') {
      console.warn(`[model-routing] ${name} is retired and ignored`);
    }
  }
}

// ── token → concrete model ────────────────────────────────────────────────

function fromToken(token: ModelToken): ResolvedModel {
  switch (token) {
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

/**
 * Parse an env override value into a token. The legacy `haiku` / `sonnet`
 * aliases are still accepted so old operator pins keep working — but they now
 * resolve to their GLM equivalents (Claude is gone), so `PATH_QUIZ_MODEL=sonnet`
 * honestly runs GLM-5.2, not Claude Sonnet.
 */
function parseToken(value: string | undefined): ModelToken | null {
  if (!value) return null;
  switch (value.trim().toLowerCase()) {
    case 'haiku':
    case 'glm-haiku':
    case 'glm-4.7':
    case 'glm4.7':
      return 'glm-haiku';
    case 'sonnet':
    case 'glm-sonnet':
    case 'glm-5.2':
    case 'glm5.2':
      return 'glm-sonnet';
    case 'flash':
      return 'flash';
    case 'flash-lite':
    case 'flashlite':
    case 'flash_lite':
    case 'lite':
      return 'flash-lite';
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

/** Static (non tier/ultra-sensitive) feature: env token override → optimized default. */
function resolveStatic(envName: string, optimized: ModelToken): ResolvedModel {
  const override = parseToken(process.env[envName]);
  if (override) return fromToken(override);
  return fromToken(optimized);
}

// ── path generation (tier/ultra/override sensitive) ───────────────────────

type PathStage = 'structure' | 'theory' | 'flashcards' | 'quiz';

const PATH_STAGE_MODEL_ENV: Record<PathStage, string> = {
  structure: 'PATH_STRUCTURE_MODEL',
  theory: 'PATH_THEORY_MODEL',
  flashcards: 'PATH_FLASHCARDS_MODEL',
  quiz: 'PATH_QUIZ_MODEL',
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

function resolvePathStage(stage: PathStage, ctx: ResolveModelCtx): ResolvedModel {
  const ultra = ctx.ultra === true;

  // 1. Per-stage env token override (e.g. PATH_QUIZ_MODEL=glm-sonnet).
  const tokenOverride = parseToken(process.env[PATH_STAGE_MODEL_ENV[stage]]);
  if (tokenOverride) return fromToken(tokenOverride);

  // 2. Structure + theory stay on GLM-5.2 (the quality surfaces: one structure
  //    call sets the whole path, theory prose is the product). Flashcards +
  //    quiz — the per-slot volume stages — run on GLM-4.7-flash for BASIC
  //    paths (cheap catalog: forced-tool structured output at ~1/7 GLM-5.2's
  //    price; same forced-tool shape + Zod validation + repair loop). ULTRA
  //    keeps GLM-5.2 on those stages: the 600k-char ultra corpus can exceed
  //    flash's window on dense material, and ultra is 3/mo capped so its spend
  //    is bounded — basic is where the flash price matters.
  if ((stage === 'flashcards' || stage === 'quiz') && !ultra) return fromToken('glm-flash');
  return fromToken('glm-sonnet');
}

// ── chat (plain turn only — generation intents route via chat-generate) ────

function resolveChatPlain(ctx: ResolveModelCtx): ResolvedModel {
  // Kill-switch for a Gemini outage: force chat off Gemini. The fallback is
  // GLM-4.7-flash (OpenRouter), NOT Claude (Claude is gone) — chat-stream's GLM
  // path handles this token.
  if (process.env.CHAT_GEMINI_DISABLED === '1') return fromToken('glm-flash');

  const override = parseToken(process.env.CHAT_PLAIN_MODEL);
  if (override) return fromToken(override);

  // FREE → Flash-Lite (keeps per-free-user AI COGS at the unit-economics
  // floor), PRO/admin → Flash. Generation intents never reach here — they
  // route via chat-generate.
  if (ctx.tier && ctx.tier !== 'FREE') return fromToken('flash');
  return fromToken('flash-lite');
}

// ── mage answer (grounded/action turn — GLM) ───────────────────────────────

/**
 * Mage Revolution Phase 4. A Mage answer runs tools (citations,
 * `annotate_answer`) via GLM/OpenRouter, so it can never route to Gemini.
 * GLM-4.7 (glm-haiku) is the cost-efficient default; `deep` mode upgrades to
 * GLM-5.2 (glm-sonnet). MAGE_ANSWER_MODEL pins the model.
 */
function resolveMageAnswer(ctx: ResolveModelCtx): ResolvedModel {
  const override = parseToken(process.env.MAGE_ANSWER_MODEL);
  if (override) return fromToken(override);
  return fromToken(ctx.mode === 'deep' ? 'glm-sonnet' : 'glm-haiku');
}

/**
 * Exam study-plan / report-summary are Gemini-STRUCTURED-only after the Claude
 * excision (their non-Gemini prompt-JSON branch was deleted). An env pin that
 * parses to a non-Gemini token would route them somewhere their caller can no
 * longer dispatch, so we warn and fall back to the Flash-Lite default.
 */
function resolveGeminiStructured(envName: string): ResolvedModel {
  const override = parseToken(process.env[envName]);
  if (override && (override === 'flash' || override === 'flash-lite')) return fromToken(override);
  if (override) {
    console.warn(
      `[model-routing] ${envName}=${process.env[envName]} is a non-Gemini token; ` +
        'this feature is Gemini-only — using the flash-lite default',
    );
  }
  return fromToken('flash-lite');
}

// ── public entry point ─────────────────────────────────────────────────────

/**
 * Resolve which provider + model a feature's call should use. Defaults encode
 * the optimized composition; each feature has a per-feature env override (see
 * comments per case).
 */
export function resolveModel(
  feature: ModelFeature,
  ctx: ResolveModelCtx = {},
): ResolvedModel {
  warnRetiredEnvOnce();
  switch (feature) {
    case 'essay': {
      // grammar + full both run on GLM-4.7 (glm-haiku). ESSAY_FULL_MODEL /
      // ESSAY_MODEL still override per call if a stronger model is ever needed.
      const isFull = ctx.action === 'full';
      const override =
        (isFull ? parseToken(process.env.ESSAY_FULL_MODEL) : null) ??
        parseToken(process.env.ESSAY_MODEL);
      if (override) return fromToken(override);
      return fromToken('glm-haiku');
    }

    case 'chat-title':
      return resolveStatic('TITLE_MODEL', 'flash-lite');

    case 'path-classify':
      // Flash-Lite (Gemini) forced-JSON classifier. CLASSIFIER_MODEL pins it
      // (a glm-* pin routes it to the openrouter forced-tool branch).
      return resolveStatic('CLASSIFIER_MODEL', 'flash-lite');

    case 'doc-summarize':
      return resolveStatic('DOCSUM_MODEL', 'flash-lite');

    case 'page-generate':
      // GLM-4.7 default; PAGE_GENERATE_MODEL env token overrides.
      return resolveStatic('PAGE_GENERATE_MODEL', 'glm-haiku');

    case 'video-ingest': {
      // Gemini-ONLY (D3): no other provider has native video ingestion, so this
      // is forced to a Gemini token. Default is Flash-Lite — lane 2's output is
      // path source-text (never shown as the final product), so the ~4-5×
      // cheaper tier is the right cost/quality trade; VIDEO_INGEST_MODEL=flash
      // pins it back for quality-sensitive cases. A non-Gemini token is rejected.
      const override = parseToken(process.env.VIDEO_INGEST_MODEL);
      if (override === 'flash' || override === 'flash-lite') return fromToken(override);
      return fromToken('flash-lite');
    }

    case 'path-preview':
      // D4 (onboarding-real-generation): the anonymous pre-signup PREVIEW —
      // structure + 1 lesson + 2 questions — the make-or-break first impression.
      // Runs on GLM-5.2, the same flagship that generates full paths.
      // PATH_PREVIEW_MODEL still pins it (e.g. =glm-haiku to go cheaper).
      return resolveStatic('PATH_PREVIEW_MODEL', 'glm-sonnet');

    case 'chat-plain':
      return resolveChatPlain(ctx);

    case 'chat-generate':
      // In-chat artifact generation (flashcards/quiz/mindmap/… via a forced
      // tool). Defaults to GLM-4.7-flash (glm-flash): forced-tool structured
      // output at ~1/7 of GLM-4.7's price. The chat-stream dispatch branches on
      // provider, so this routes straight to OpenRouter. CHAT_GENERATE_MODEL pins it.
      return resolveStatic('CHAT_GENERATE_MODEL', 'glm-flash');

    case 'chat-intent':
      // Per-turn intent gate (forced single-enum tool, runs only on ambiguous
      // turns the heuristic can't resolve). Defaults to GLM-4.7-flash
      // (glm-flash) — a tiny forced-enum call on the cheapest reliable
      // tool-calling tier. chat-intent dispatches on provider (openrouter →
      // forced callOpenRouter). CHAT_INTENT_MODEL pins it.
      return resolveStatic('CHAT_INTENT_MODEL', 'glm-flash');

    case 'mage-answer':
      return resolveMageAnswer(ctx);

    case 'quiz-verify':
      // Independent, narrow quality check. Always Gemini 2.5 Flash-Lite via
      // OpenRouter—not Google-direct—so its exact billed cost is captured.
      return fromToken('or-flash-lite');

    case 'exam-study-plan':
      // Daily/multi-day task ordering + the "Why this plan" rationale. Structured
      // + short prose, so Flash-Lite suffices; bump via EXAM_STUDY_PLAN_MODEL
      // (=flash) if quality testing fails. Gemini-structured only.
      // Meter: reuse `ai_study_plan` (reserveUsage at the generator).
      return resolveGeminiStructured('EXAM_STUDY_PLAN_MODEL');

    case 'exam-mock-questions': {
      // Fresh mock questions for the shortfall when scope content is thin. Prefer
      // drawing from existing path quizzes; only the gap is generated. Reuses the
      // path-quiz routing (glm-flash basic / glm-sonnet ultra) so it tracks the
      // same quality bar. EXAM_MOCK_QUESTIONS_MODEL pins it.
      // Meter: reuse `ai_quizzes` (reserveUsage at the generator).
      const override = parseToken(process.env.EXAM_MOCK_QUESTIONS_MODEL);
      if (override) return fromToken(override);
      return resolvePathStage('quiz', ctx);
    }

    case 'exam-weak-analysis':
      // Group weak topics, write per-topic notes + readiness-impact. Cheap
      // grouping/labelling work. Meter: piggybacks the calling surface's meter
      // (no dedicated reserve — runs inside readiness/plan generation).
      return resolveStatic('EXAM_WEAK_ANALYSIS_MODEL', 'flash-lite');

    case 'exam-report-summary':
      // Predicted-vs-actual + recommended-next prose for the post-exam report.
      // Short, cheap. Gemini-structured only. Meter: reuse `ai_study_plan`.
      return resolveGeminiStructured('EXAM_REPORT_MODEL');

    case 'concept-backfill-classify':
      // One slot's items (typically 5-15) per call — closed-enum concept
      // candidates + per-item conceptKeys, mirroring exam-weak-analysis's
      // cheap grouping/labelling tier. CONCEPT_BACKFILL_MODEL pins it.
      return resolveStatic('CONCEPT_BACKFILL_MODEL', 'flash-lite');

    case 'weakness-misconception-tag':
      // One de-personalised misconception line per call — short, cheap,
      // batched/async/hysteresis-gated (§2.3 tier 2). Same cheap tier as
      // concept-backfill-classify/exam-weak-analysis. WEAKNESS_MISCONCEPTION_MODEL pins it.
      return resolveStatic('WEAKNESS_MISCONCEPTION_MODEL', 'flash-lite');

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
