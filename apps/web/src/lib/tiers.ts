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
  | 'path_translation';

export interface TierConfig {
  name: string;
  priceCHF: number;
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
    tokenLimit: 100_000,
    limits: {
      ai_flashcards: 1,
      ai_pptx: 1,
      // Phase 12 (path-publishing) free-tier switchover — gated by the
      // FREE_TIER_AI_PATHS_DISABLED env var. When the flag is on this
      // returns 0 so checkUsageLimit blocks FREE AI path generation and
      // FREE users get paths from the community library instead; when off
      // it stays at the legacy allowance of 3. A getter (not a constant)
      // so a container restart flips it without a rebuild — the one-minute
      // rollback in plan §5.2 / AC-Switch-5 depends on this. Per P0 spec
      // §5.1 the change lives in exactly this one place. (On the client
      // the env var is undefined, so this reads 3; the authoritative gate
      // is server-side.)
      get ai_study_plan(): number {
        return freeTierAiPathsDisabled() ? 0 : 3;
      },
      ultra_path: 0, // Pro-only — Free is rejected server-side and the toggle is greyed out
      ai_quizzes: 2,
      scholar_chat: 50,
      ai_inline_edit: 0,
      pdf_import: 50, // pages, not imports — a one-time lifetime allowance (see LIFETIME_LIMITS)
      path_translation: 5, // lifetime allowance — see LIFETIME_LIMITS.FREE
    },
    badge: {
      label: 'Free',
      className: 'bg-white/10 text-gray-400 border border-white/10',
    },
  },
  PRO: {
    name: 'Pro',
    priceCHF: 10,
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
  FREE: ['pdf_import', 'path_translation'],
};

/** True when a tier's limit for a feature is a lifetime budget, not monthly. */
export function isLifetimeLimit(tier: TierKey, feature: FeatureType): boolean {
  return LIFETIME_LIMITS[tier]?.includes(feature) ?? false;
}

export function getMonthStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}
