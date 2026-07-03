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
   * (admin MRR estimate) — equal to `price.monthly`. Interval-aware
   * surfaces should read `price[interval]` instead.
   */
  priceCHF: number;
  /** Per-interval CHF prices. The pricing page + onboarding switch on these.
   *  Points chosen to land under 10 in the major display currencies:
   *  CHF 7.90 ≈ $9.75 ≈ €8.60 per month. */
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
      code_execute: 300, // monthly anti-abuse cap on sandboxed code runs
    },
    badge: {
      label: 'Free',
      className: 'bg-white/10 text-gray-400 border border-white/10',
    },
  },
  PRO: {
    name: 'Pro',
    priceCHF: 7.9,
    price: { weekly: 3.2, monthly: 7.9, yearly: 64 },
    // The REAL global COGS bound: checkTokenBudget sums AiUsageEvent in+out
    // tokens across EVERY AI surface (paths included — one big ultra ≈ 385k).
    // 4M ≈ $5 worst-case COGS at measured GLM rates (~$1.25/M budget tokens
    // incl. unbudgeted cache reads) vs ~$7–9 net on CHF 7.90 — sized so
    // "unlimited basic paths" (AI_PATHS_PER_DAY pacing) never trips it in
    // legitimate use. Keep tokenLimit ≥ ~10× a big ultra run or paths eat chat.
    tokenLimit: 4_000_000,
    limits: {
      ai_flashcards: -1,
      ai_pptx: -1,
      ai_study_plan: -1, // basic paths unlimited monthly — paced by AI_PATHS_PER_DAY + tokenLimit
      ultra_path: 3, // matches the long-standing marketing copy AND the observed
      // real max (3/user/mo). MEASURED COGS ~$0.48 avg / ~$1.20 large-corpus per
      // path → worst case ≈ $3.60/mo. The premium is the 600k-char corpus + 3
      // retry sweeps, not the model (all paths run GLM-5.2).
      ai_quizzes: -1,
      scholar_chat: -1,
      ai_inline_edit: -1,
      pdf_import: 450, // pages per month
      youtube_transcript: 1000, // ⚠️ MINUTES of video per month — placeholder, set final number
      video_ingest: 1000, // MINUTES of video per month (worst-case COGS ~$1.85/mo); never -1
      path_regenerate: 10, // monthly anti-abuse cap on path re-generations —
      // each regen is a FULL path generation (~$0.5–1.2), so 50 was a bigger
      // exposure than the ultra cap itself; 10 covers real recovery use.
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

/**
 * Purchasing-power-adjusted price group. Visitors whose display currency is in
 * PPP_CURRENCIES see (and check out at) these CHF price points instead of the
 * base Pro prices — at 2026-07 rates they convert to ≈₹154/₹496/₹4,019,
 * ≈R$8.40/R$27/R$219, ≈₺75/₺243/₺1,967. One group (not per-country prices)
 * keeps Lemon Squeezy setup to 3 extra variants, and the lowest point still
 * clears typical per-user AI COGS ~2× (see memory pro-unit-economics-2026-07).
 * Checkout routes to the dedicated PPP variants via the *_PPP env URLs in
 * lemonsqueezy-client.ts; while those are unset, PPP visitors gracefully fall
 * back to the base-price checkout (and see base prices — PPP_CHECKOUT_CONFIGURED).
 */
/**
 * Daily pacing limit on AI path creations (basic + ultra combined), enforced
 * at the create route by counting today's `source: 'ai'` StudyPlans. Basic
 * paths are "unlimited" per month for Pro — this bounds single-day bursts
 * (covers a realistic "import my whole semester" evening) while tokenLimit
 * remains the monthly COGS ceiling. Admins bypass.
 */
export const AI_PATHS_PER_DAY = 5;

export const PPP_CURRENCIES: readonly string[] = ['INR', 'BRL', 'TRY'];
export const PPP_PRICE: TierPricing = { weekly: 1.3, monthly: 4.2, yearly: 34 };

/** True when a display currency belongs to the PPP price group. */
export function isPppCurrency(currency: string | undefined): boolean {
  return !!currency && PPP_CURRENCIES.includes(currency);
}

/** Region-aware Pro price in CHF: the PPP group price for PPP currencies, else base. */
export function proPriceCHF(interval: BillingInterval, currency?: string): number {
  return isPppCurrency(currency) ? PPP_PRICE[interval] : TIERS.PRO.price[interval];
}

/** The CHF the yearly plan costs per month (yearly ÷ 12). 0 when no yearly price.
 *  Pass the visitor's currency to get the PPP group's figure where it applies. */
export function monthlyEquivalent(tier: TierKey, currency?: string): number {
  const yearly = tier === 'PRO' ? proPriceCHF('yearly', currency) : TIERS[tier].price.yearly;
  return yearly > 0 ? yearly / 12 : 0;
}

/**
 * Whole-percent saved by paying yearly instead of 12× monthly. Computed from the
 * prices so the "Save N%" badge can never drift from what we actually charge.
 * Returns 0 when either price is missing (e.g. the FREE tier). Currency-aware
 * for the PPP group, like monthlyEquivalent.
 */
export function yearlySavingsPct(tier: TierKey, currency?: string): number {
  const monthly = tier === 'PRO' ? proPriceCHF('monthly', currency) : TIERS[tier].price.monthly;
  const yearly = tier === 'PRO' ? proPriceCHF('yearly', currency) : TIERS[tier].price.yearly;
  if (monthly <= 0 || yearly <= 0) return 0;
  const monthlyAnnualised = monthly * 12;
  return Math.round(((monthlyAnnualised - yearly) / monthlyAnnualised) * 100);
}
