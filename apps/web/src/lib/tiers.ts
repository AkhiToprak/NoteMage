import type { Tier } from '@prisma/client';

export type TierKey = Tier;

export type FeatureType =
  | 'ai_flashcards'
  | 'ai_pptx'
  | 'ai_study_plan'
  | 'scholar_chat'
  | 'ai_quizzes'
  | 'ai_inline_edit'
  | 'pdf_import';

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
      ai_study_plan: 2,
      ai_quizzes: 2,
      scholar_chat: 50,
      ai_inline_edit: 0,
      pdf_import: 50, // pages, not imports — a one-time lifetime allowance (see LIFETIME_LIMITS)
    },
    badge: {
      label: 'Free',
      className: 'bg-white/10 text-gray-400 border border-white/10',
    },
  },
  PLUS: {
    name: 'Plus',
    priceCHF: 5,
    tokenLimit: 500_000,
    limits: {
      ai_flashcards: 4,
      ai_pptx: 3,
      ai_study_plan: 4,
      ai_quizzes: 4,
      scholar_chat: 100,
      ai_inline_edit: 0,
      pdf_import: 450, // dormant — PLUS is being retired; mirrors PRO so any legacy PLUS user is not under-served
    },
    badge: {
      label: 'Plus',
      className:
        'bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-[0_0_8px_rgba(168,85,247,0.3)]',
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
      ai_quizzes: -1,
      scholar_chat: -1,
      ai_inline_edit: -1,
      pdf_import: 450, // pages per month
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
  FREE: ['pdf_import'],
};

/** True when a tier's limit for a feature is a lifetime budget, not monthly. */
export function isLifetimeLimit(tier: TierKey, feature: FeatureType): boolean {
  return LIFETIME_LIMITS[tier]?.includes(feature) ?? false;
}

export function getMonthStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}
