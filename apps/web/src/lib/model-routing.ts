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

export type ModelProvider = 'anthropic' | 'gemini';

/** The four models the composition picks between. */
export type ModelToken = 'haiku' | 'sonnet' | 'flash' | 'flash-lite';

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
  | 'chat-plain'
  | 'mage-answer'
  | 'inline-rewrite'
  | 'inline-summarize'
  | 'inline-expand'
  | 'doc-summarize'
  | 'page-generate'
  | 'video-ingest';

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
    default:
      return null;
  }
}

export function isLegacyComposition(): boolean {
  const v = process.env.MODEL_COMPOSITION_LEGACY;
  return v === '1' || v === 'true';
}

/** Static (non tier/ultra-sensitive) feature: env token override → legacy/optimized. */
function resolveStatic(
  envName: string,
  legacy: ModelToken,
  optimized: ModelToken,
): ResolvedModel {
  const override = parseToken(process.env[envName]);
  if (override) return fromToken(override);
  return fromToken(isLegacyComposition() ? legacy : optimized);
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

  // 4. Optimized composition (the −67% ultra-path saving).
  switch (stage) {
    case 'structure':
      return fromToken(ultra ? 'sonnet' : 'flash');
    case 'theory':
    case 'flashcards':
      return fromToken('flash-lite');
    case 'quiz':
      // Haiku for ALL tiers — it beat Sonnet/Flash on correctness in the audit,
      // so the ultra→Sonnet upgrade is dropped. Override via PATH_QUIZ_MODEL.
      return fromToken('haiku');
  }
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
  if (ctx.mode === 'deep') return fromToken('sonnet');
  return fromToken('haiku');
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
      return fromToken(isLegacyComposition() ? 'sonnet' : 'haiku');
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
      return fromToken(isLegacyComposition() ? 'haiku' : 'flash-lite');
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

    case 'chat-plain':
      return resolveChatPlain(ctx);

    case 'mage-answer':
      return resolveMageAnswer(ctx);

    case 'path-structure':
    case 'path-theory':
    case 'path-flashcards':
    case 'path-quiz':
      return resolvePathStage(FEATURE_TO_STAGE[feature], ctx);
  }
}
