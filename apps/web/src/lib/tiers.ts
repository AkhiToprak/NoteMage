import type { Tier } from '@prisma/client';

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
  // Video-as-context (Lane 1) — counts YouTube transcript extractions. Costs
  // ~0 AI tokens, but oEmbed + transcript fetch are outbound calls, so an
  // abuse cap is mandatory: FREE is lifetime-capped, PRO is monthly.
  | 'youtube_transcript'
  // Native video ingestion (Lane 2) — metered in MINUTES of video, not call
  // count. Real Gemini COGS, so FREE gets a small LIFETIME trial budget (summed
  // across all months — see LIFETIME_LIMITS.FREE) and PRO a monthly minutes
  // cap. Never -1.
  | 'video_ingest'
  // Path regeneration — counts re-runs of an already-generated path. Each is a
  // full AI generation, so a monthly anti-abuse cap is mandatory (never -1).
  | 'path_regenerate'
  // Path translation re-trigger — counts on-demand translations of an existing
  // path. Monthly anti-abuse cap.
  | 'path_translate'
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
      // AI path generation is a Pro feature — FREE is rejected server-side
      // (checkUsageLimit) and the create CTA points to upgrade.
      ai_study_plan: 0,
      ultra_path: 0, // Pro-only — Free is rejected server-side and the toggle is greyed out
      ai_quizzes: 2,
      scholar_chat: 50,
      ai_inline_edit: 0,
      pdf_import: 50, // pages, not imports — a one-time lifetime allowance (see LIFETIME_LIMITS)
      youtube_transcript: 120, // ⚠️ MINUTES of video (lifetime) — placeholder, set final number
      video_ingest: 15, // MINUTES — one-time lifetime trial of native video notes (see LIFETIME_LIMITS.FREE)
      path_regenerate: 5, // monthly anti-abuse cap on path re-generations
      path_translate: 5, // monthly anti-abuse cap on on-demand path translations
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
      ultra_path: 30, // anti-abuse safety cap, ~1/day. Paths run on GLM-5.2
      // (~12¢ each), so 30/mo = ~$3.60 worst-case COGS vs 12.99 CHF revenue.
      ai_quizzes: -1,
      scholar_chat: -1,
      ai_inline_edit: -1,
      pdf_import: 450, // pages per month
      youtube_transcript: 1000, // ⚠️ MINUTES of video per month — placeholder, set final number
      video_ingest: 1000, // MINUTES of video per month (worst-case COGS ~$1.85/mo); never -1
      path_regenerate: 50, // monthly anti-abuse cap on path re-generations
      path_translate: 50, // monthly anti-abuse cap on on-demand path translations
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
  FREE: ['pdf_import', 'youtube_transcript', 'video_ingest'],
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
