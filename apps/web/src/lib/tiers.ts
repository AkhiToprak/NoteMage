import type { Tier } from '@prisma/client';
import { freeTierAiPathsDisabled } from '@/lib/feature-flags';

export type TierKey = Tier;

export type FeatureType =
  | 'ai_flashcards'
  | 'ai_pptx'
  | 'ai_study_plan'
  | 'ultra_path'
  | 'scholar_chat'
  | 'ai_quizzes'
  | 'ai_inline_edit'
  | 'pdf_import'
  // Path-publishing (Phase 1) — counts AI-call (cache-miss) translations of
  // community paths. FREE is lifetime-capped; PRO is monthly anti-abuse.
  | 'path_translation'
  // Video-as-context (Lane 1) — counts YouTube transcript extractions. Costs
  // ~0 AI tokens, but oEmbed + transcript fetch are outbound calls, so an
  // abuse cap is mandatory: FREE is lifetime-capped, PRO is monthly.
  | 'youtube_transcript'
  // Native video ingestion (Lane 2) — metered in MINUTES of video, not call
  // count. Real Gemini COGS, so FREE = 0 (hard PRO gate, checkUsageLimit blocks)
  // and PRO is a monthly minutes cap. Never -1.
  | 'video_ingest'
  // Path regeneration — counts re-runs of an already-generated path. Each is a
  // full AI generation, so a monthly anti-abuse cap is mandatory (never -1).
  | 'path_regenerate'
  // Path translation re-trigger — counts on-demand translations of an existing
  // path (distinct from community-library `path_translation`). Monthly anti-abuse cap.
  | 'path_translate'
  // Moderation audit re-runs — counts manual re-moderation passes. Monthly anti-abuse cap.
  | 'moderation_audit'
  // Sandboxed code execution — counts code-run invocations. Monthly anti-abuse cap.
  | 'code_execute';

/** The three billing cadences a paid tier can be purchased on. */
export type BillingInterval = 'weekly' | 'monthly' | 'yearly';

/** CHF charged per billing period, one figure per interval. FREE is all-zero. */
export interface TierPricing {
  weekly: number;
  monthly: number;
  yearly: number;
}

export interface TierConfig {
  name: string;
  /**
   * Canonical headline price (CHF / month). Kept for non-interval surfaces
   * (FAQ copy, admin MRR estimate) — equal to `price.monthly`. Interval-aware
   * surfaces should read `price[interval]` instead.
   */
  priceCHF: number;
  /** Per-interval CHF prices. The pricing page + onboarding switch on these. */
  price: TierPricing;
  /** Monthly token budget (input + output combined). */
  tokenLimit: number;
  limits: Record<FeatureType, number>; // -1 = unlimited
  badge: {
    label: string;
    className: string; // Tailwind classes
  };
}

export const TIERS: Record<TierKey, TierConfig> = {
  FREE: {
    name: 'Free',
    priceCHF: 0,
    price: { weekly: 0, monthly: 0, yearly: 0 },
    tokenLimit: 100_000,
    limits: {
      ai_flashcards: 1,
      ai_pptx: 1,
      // Phase 12 (path-publishing) free-tier switchover — AI path
      // generation is a Pro feature, so this returns 0 by DEFAULT:
      // checkUsageLimit then blocks FREE AI path generation and FREE users
      // get paths from the community library instead. Set
      // FREE_TIER_AI_PATHS_DISABLED=false to restore the legacy allowance
      // of 3 (the re-enable lever). A getter (not a constant) so a
      // container restart flips it without a rebuild — the one-minute
      // rollback in plan §5.2 / AC-Switch-5 depends on this. Per P0 spec
      // §5.1 the change lives in exactly this one place. (On the client
      // the env var is undefined, so this reads 0 — matching the default;
      // the authoritative gate is server-side.)
      get ai_study_plan(): number {
        return freeTierAiPathsDisabled() ? 0 : 3;
      },
      ultra_path: 0, // Pro-only — Free is rejected server-side and the toggle is greyed out
      ai_quizzes: 2,
      scholar_chat: 50,
      ai_inline_edit: 0,
      pdf_import: 50, // pages, not imports — a one-time lifetime allowance (see LIFETIME_LIMITS)
      path_translation: 5, // lifetime allowance — see LIFETIME_LIMITS.FREE
      youtube_transcript: 20, // lifetime allowance — see LIFETIME_LIMITS.FREE
      video_ingest: 0, // hard PRO gate — native video notes are PRO-only (checkUsageLimit blocks at 0)
      path_regenerate: 5, // monthly anti-abuse cap on path re-generations
      path_translate: 5, // monthly anti-abuse cap on on-demand path translations
      moderation_audit: 10, // monthly anti-abuse cap on re-moderation passes
      code_execute: 300, // monthly anti-abuse cap on sandboxed code runs
    },
    badge: {
      label: 'Free',
      className: 'bg-white/10 text-gray-400 border border-white/10',
    },
  },
  PRO: {
    name: 'Pro',
    priceCHF: 12.99,
    price: { weekly: 4.5, monthly: 12.99, yearly: 99 },
    tokenLimit: 1_000_000,
    limits: {
      ai_flashcards: -1,
      ai_pptx: -1,
      ai_study_plan: -1,
      ultra_path: 3, // 3 ultra paths per month
      ai_quizzes: -1,
      scholar_chat: -1,
      ai_inline_edit: -1,
      pdf_import: 450, // pages per month
      path_translation: 50, // anti-abuse monthly cap (never shipped as -1)
      youtube_transcript: 200, // anti-abuse monthly cap (never shipped as -1)
      video_ingest: 1000, // MINUTES of video per month (worst-case COGS ~$1.85/mo); never -1
      path_regenerate: 50, // monthly anti-abuse cap on path re-generations
      path_translate: 50, // monthly anti-abuse cap on on-demand path translations
      moderation_audit: 30, // monthly anti-abuse cap on re-moderation passes
      code_execute: 3000, // monthly anti-abuse cap on sandboxed code runs
    },
    badge: {
      label: 'Pro',
      className:
        'bg-yellow-500/20 text-yellow-300 border border-yellow-500/40 shadow-[0_0_8px_rgba(255,222,89,0.3)]',
    },
  },
};

/**
 * Feature limits that accumulate over the account's lifetime instead of
 * resetting each month. FREE's PDF-import budget is a one-time allowance —
 * a trial of the feature — so its usage is summed across every month
 * rather than read from the current month alone.
 */
export const LIFETIME_LIMITS: Partial<Record<TierKey, readonly FeatureType[]>> = {
  FREE: ['pdf_import', 'path_translation', 'youtube_transcript'],
};

/** True when a tier's limit for a feature is a lifetime budget, not monthly. */
export function isLifetimeLimit(tier: TierKey, feature: FeatureType): boolean {
  return LIFETIME_LIMITS[tier]?.includes(feature) ?? false;
}

export function getMonthStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** Short price suffix per interval, e.g. "/mo". */
export const INTERVAL_SUFFIX: Record<BillingInterval, string> = {
  weekly: '/wk',
  monthly: '/mo',
  yearly: '/yr',
};

/** Human label per interval, for toggles/segmented controls. */
export const INTERVAL_LABEL: Record<BillingInterval, string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  yearly: 'Yearly',
};

/** The CHF the yearly plan costs per month (yearly ÷ 12). 0 when no yearly price. */
export function monthlyEquivalent(tier: TierKey): number {
  const { yearly } = TIERS[tier].price;
  return yearly > 0 ? yearly / 12 : 0;
}

/**
 * Whole-percent saved by paying yearly instead of 12× monthly. Computed from the
 * prices so the "Save N%" badge can never drift from what we actually charge.
 * Returns 0 when either price is missing (e.g. the FREE tier).
 */
export function yearlySavingsPct(tier: TierKey): number {
  const { monthly, yearly } = TIERS[tier].price;
  if (monthly <= 0 || yearly <= 0) return 0;
  const monthlyAnnualised = monthly * 12;
  return Math.round(((monthlyAnnualised - yearly) / monthlyAnnualised) * 100);
}
