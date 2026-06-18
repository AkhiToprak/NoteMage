'use client';

import { useState } from 'react';
import {
  TIERS,
  isLifetimeLimit,
  INTERVAL_SUFFIX,
  type TierKey,
  type FeatureType,
  type BillingInterval,
} from '@/lib/tiers';

interface PricingCardProps {
  tier: TierKey;
  selected?: boolean;
  onSelect?: (tier: TierKey) => void;
  /** When provided, the CTA becomes a button that runs this (e.g. open checkout) instead of navigating. Takes precedence over ctaHref. */
  onUpgrade?: () => void;
  ctaText?: string;
  ctaHref?: string;
  formattedPrice?: string;
  /** Billing cadence the price reflects — drives the "/wk · /mo · /yr" suffix. */
  interval?: BillingInterval;
  /** Optional secondary line under the price, e.g. the per-month equivalent on yearly. */
  priceSubline?: string;
  isRevealed?: boolean;
  delay?: number;
  /** Tighter spacing/typography for embedded contexts like the onboarding wizard. */
  compact?: boolean;
  /**
   * Phase 12 switchover: when true, the FREE tier's AI path generation is off,
   * so the FREE card shows "Community study paths" instead of an AI-path count.
   * Must be resolved server-side and passed in — the env flag is stripped from
   * the client bundle, so the component can't read it itself.
   */
  freeAiPathsDisabled?: boolean;
  /** Cap the number of feature rows shown. Used by the compact onboarding plan
   *  step so two cards fit a laptop viewport without scrolling. */
  maxFeatures?: number;
}

// Only features with a label here are shown on the pricing card. Internal
// anti-abuse caps (path_regenerate, path_translate, moderation_audit,
// code_execute) are intentionally omitted so they never surface as a "plan
// feature" — the filter below drops any FeatureType missing from this map.
const FEATURE_LABELS: Partial<Record<FeatureType, string>> = {
  ai_flashcards: 'AI Flashcard sets',
  ai_pptx: 'AI Presentations',
  ai_study_plan: 'AI Study Plans',
  ultra_path: 'Ultra paths',
  ai_quizzes: 'AI Quizzes',
  scholar_chat: 'Mage Chat messages',
  ai_inline_edit: 'Inline AI editing',
  pdf_import: 'PDF pages',
  path_translation: 'Path translations',
  youtube_transcript: 'Video transcript minutes',
  video_ingest: 'Video notes (minutes)',
};

const ACCENT: Record<
  TierKey,
  { border: string; glow: string; bg: string; text: string; hoverGlow: string }
> = {
  FREE: {
    border: 'rgba(136,136,168,0.30)',
    glow: 'none',
    bg: 'rgba(33, 33, 62,0.6)',
    text: 'var(--on-surface-variant)',
    hoverGlow: '0 8px 32px rgba(174,137,255,0.06), 0 2px 8px rgba(0,0,0,0.3)',
  },
  PRO: {
    border: 'rgba(255,222,89,0.45)',
    glow: '0 0 40px rgba(255,222,89,0.08), 0 8px 24px rgba(174,137,255,0.04)',
    bg: 'rgba(255,222,89,0.03)',
    text: 'var(--tertiary-container)',
    hoverGlow:
      '0 0 56px rgba(255,222,89,0.16), 0 12px 40px rgba(255,222,89,0.08), 0 4px 12px rgba(0,0,0,0.3)',
  },
};

export default function PricingCard({
  tier,
  selected = false,
  onSelect,
  onUpgrade,
  ctaText,
  ctaHref,
  formattedPrice,
  interval = 'monthly',
  priceSubline,
  isRevealed = true,
  delay = 0,
  compact = false,
  freeAiPathsDisabled = false,
  maxFeatures,
}: PricingCardProps) {
  const config = TIERS[tier];
  const accent = ACCENT[tier];
  const isPopular = tier === 'PRO';
  const isPro = tier === 'PRO';
  const [hovered, setHovered] = useState(false);
  const [ctaHovered, setCtaHovered] = useState(false);

  const periodAmount = config.price[interval];
  const displayPrice =
    formattedPrice ?? (periodAmount === 0 ? 'Free' : `CHF ${periodAmount}`);

  const cardPadding = compact
    ? isPro
      ? '28px 22px 22px'
      : '20px 22px 22px'
    : isPro
      ? '40px 32px 36px'
      : '32px 32px 36px';

  const cardStyle: React.CSSProperties = {
    position: 'relative',
    background: selected
      ? accent.bg
      : isPro
        ? 'var(--surface-container)'
        : 'var(--surface-container-low)',
    border: `1px solid ${selected ? accent.text : accent.border}`,
    borderRadius: 'var(--radius-xl)',
    padding: cardPadding,
    display: 'flex',
    flexDirection: 'column',
    gap: compact ? 12 : 20,
    flex: '1 1 0',
    minWidth: 0,
    maxWidth: 400,
    cursor: onSelect ? 'pointer' : 'default',
    boxShadow: selected ? `0 0 40px ${accent.text}33` : hovered ? accent.hoverGlow : accent.glow,
    opacity: isRevealed ? 1 : 0,
    transform: isRevealed ? (isPro ? 'scale(1.03)' : 'translateY(0)') : 'translateY(24px)',
    transition: `
      opacity 0.6s cubic-bezier(0.22,1,0.36,1) ${delay}ms,
      transform 0.4s cubic-bezier(0.22,1,0.36,1),
      box-shadow 0.35s cubic-bezier(0.22,1,0.36,1),
      border-color 0.25s cubic-bezier(0.22,1,0.36,1)
    `.trim(),
    overflow: 'visible',
  };

  // Hover highlight gradient at top edge
  const topHighlightStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    background: isPro
      ? 'rgba(255,222,89,0.4)'
      : isPopular
        ? 'rgba(174,137,255,0.3)'
        : 'rgba(136,136,168,0.15)',
    opacity: hovered || selected ? 1 : 0,
    transition: 'opacity 0.35s cubic-bezier(0.22,1,0.36,1)',
  };

  // Shared CTA visual — rendered as a <button> when onUpgrade is set, else an <a>.
  const ctaStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    textAlign: 'center',
    padding: '14px 24px',
    borderRadius: 'var(--radius-md)',
    fontWeight: 700,
    fontSize: 14,
    textDecoration: 'none',
    background: isPro
      ? 'var(--tertiary-container)'
      : isPopular
        ? 'var(--primary)'
        : 'var(--surface-container-high)',
    color: isPro ? '#22223a' : isPopular ? '#fff' : 'var(--on-surface-variant)',
    border: tier === 'FREE' ? '1px solid rgba(136,136,168,0.15)' : 'none',
    transform: ctaHovered ? 'translateY(-2px)' : 'translateY(0)',
    boxShadow: ctaHovered
      ? isPro
        ? '0 8px 24px rgba(255,222,89,0.25), 0 2px 8px rgba(0,0,0,0.2)'
        : isPopular
          ? '0 8px 24px rgba(174,137,255,0.2), 0 2px 8px rgba(0,0,0,0.2)'
          : '0 4px 16px rgba(0,0,0,0.2)'
      : 'none',
    transition:
      'transform 0.25s cubic-bezier(0.22,1,0.36,1), box-shadow 0.25s cubic-bezier(0.22,1,0.36,1)',
  };

  const ctaInner = (
    <>
      <span
        className="material-symbols-outlined"
        style={{ fontSize: 18, fontVariationSettings: "'FILL' 1" }}
      >
        {isPro ? 'bolt' : isPopular ? 'rocket_launch' : 'arrow_forward'}
      </span>
      {ctaText ?? 'Get Started'}
    </>
  );

  const content = (
    <>
      {/* Top highlight line */}
      <div style={topHighlightStyle} />

      {/* Popular badge */}
      {isPopular && (
        <div
          className="popular-badge"
          style={{
            position: 'absolute',
            top: -13,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--tertiary-container)',
            color: '#22223a',
            fontSize: 11,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            padding: '5px 16px',
            borderRadius: 'var(--radius-full)',
            whiteSpace: 'nowrap',
            boxShadow: '0 4px 16px rgba(255,222,89,0.25)',
          }}
        >
          Most Popular
        </div>
      )}

      {/* Tier name */}
      <h3
        style={{
          margin: 0,
          fontSize: compact ? 16 : 18,
          fontWeight: 700,
          color: accent.text,
          fontFamily: 'var(--font-display)',
          letterSpacing: '-0.01em',
        }}
      >
        {config.name}
      </h3>

      {/* Price */}
      <div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
          <span
            style={{
              fontSize: compact ? 30 : 40,
              fontWeight: 800,
              color: 'var(--on-surface)',
              letterSpacing: '-0.03em',
              fontFamily: 'var(--font-display)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {displayPrice}
          </span>
          {periodAmount > 0 && (
            <span style={{ fontSize: 14, color: 'var(--outline)', fontWeight: 500 }}>
              {INTERVAL_SUFFIX[interval]}
            </span>
          )}
        </div>
        {priceSubline && periodAmount > 0 && (
          <span
            style={{
              display: 'block',
              marginTop: 4,
              fontSize: 12,
              color: 'var(--outline)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {priceSubline}
          </span>
        )}
      </div>

      {/* Divider */}
      <div
        style={{
          height: 1,
          background: accent.border,
          opacity: 0.6,
        }}
      />

      {/* Features list */}
      <ul
        style={{
          margin: 0,
          padding: 0,
          listStyle: 'none',
          display: 'flex',
          flexDirection: 'column',
          gap: compact ? 8 : 12,
          flex: 1,
        }}
      >
        {(Object.entries(config.limits) as [FeatureType, number][])
          .filter(([feature]) => feature in FEATURE_LABELS)
          .slice(0, maxFeatures ?? Infinity)
          .map(([feature, limit], idx) => {
          // Phase 12 switchover: when FREE AI paths are off, surface the curated
          // community-paths offering as an included feature instead of a count.
          const isCommunityPaths =
            freeAiPathsDisabled && tier === 'FREE' && feature === 'ai_study_plan';
          const dimmed = !isCommunityPaths && limit === 0;
          return (
            <li
              key={feature}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                fontSize: compact ? 13 : 14,
                color: 'var(--on-surface-variant)',
                lineHeight: 1.4,
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{
                  fontSize: 18,
                  color: dimmed ? 'var(--outline)' : accent.text,
                  fontVariationSettings: "'FILL' 1",
                  flexShrink: 0,
                  opacity: isRevealed ? 1 : 0,
                  transform: isRevealed ? 'scale(1)' : 'scale(0.5)',
                  transition: `opacity 0.4s cubic-bezier(0.22,1,0.36,1), transform 0.4s cubic-bezier(0.22,1,0.36,1)`,
                  transitionDelay: `${delay + 200 + idx * 50}ms`,
                }}
              >
                {isCommunityPaths
                  ? 'check_circle'
                  : limit === -1
                    ? 'all_inclusive'
                    : limit === 0
                      ? 'lock'
                      : 'check_circle'}
              </span>
              <span
                style={
                  dimmed
                    ? {
                        color: 'var(--outline)',
                        textDecoration: 'line-through',
                      }
                    : undefined
                }
              >
                {isCommunityPaths ? (
                  'Community study paths'
                ) : (
                  <>
                    {limit === -1 ? (
                      <strong style={{ color: accent.text }}>Unlimited*</strong>
                    ) : limit === 0 ? null : (
                      limit
                    )}
                    {limit !== 0 && ' '}
                    {FEATURE_LABELS[feature]}
                    {limit > 0 && (
                      <span style={{ color: 'var(--outline)' }}>
                        {isLifetimeLimit(tier, feature) ? ' total' : '/mo'}
                      </span>
                    )}
                    {limit === 0 && (
                      <span
                        style={{
                          display: 'inline-block',
                          marginLeft: 6,
                          padding: '1px 6px',
                          borderRadius: 999,
                          background: 'rgba(255, 222, 89, 0.14)',
                          border: '1px solid rgba(255, 222, 89, 0.32)',
                          color: '#ffde59',
                          fontSize: 10,
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          letterSpacing: '0.08em',
                          verticalAlign: 'middle',
                          textDecoration: 'none',
                        }}
                      >
                        Pro
                      </span>
                    )}
                  </>
                )}
              </span>
            </li>
          );
        })}
      </ul>

      {/* Pro footnote — hidden in compact (onboarding) to keep the card short;
          the full explanation lives on the /pricing page. */}
      {isPro && !compact && (
        <p
          style={{
            margin: 0,
            fontSize: 11,
            color: 'var(--outline)',
            lineHeight: 1.5,
            fontStyle: 'italic',
          }}
        >
          *Fair use (~1M tokens/mo). Every AI request costs us, so this prevents abuse — but
          it&apos;s way more than you&apos;d ever need.
        </p>
      )}

      {/* CTA */}
      {onUpgrade ? (
        <button
          type="button"
          onClick={onUpgrade}
          onMouseEnter={() => setCtaHovered(true)}
          onMouseLeave={() => setCtaHovered(false)}
          style={{ ...ctaStyle, width: '100%', cursor: 'pointer' }}
        >
          {ctaInner}
        </button>
      ) : ctaHref ? (
        <a
          href={ctaHref}
          onMouseEnter={() => setCtaHovered(true)}
          onMouseLeave={() => setCtaHovered(false)}
          style={ctaStyle}
        >
          {ctaInner}
        </a>
      ) : onSelect ? (
        <div
          style={{
            textAlign: 'center',
            padding: '12px',
            borderRadius: 'var(--radius-md)',
            fontWeight: 600,
            fontSize: 14,
            color: selected ? accent.text : 'var(--outline)',
            border: selected ? `2px solid ${accent.text}` : '1px solid rgba(136,136,168,0.2)',
            background: selected ? accent.bg : 'transparent',
            transition:
              'transform 0.2s cubic-bezier(0.22,1,0.36,1), border-color 0.2s, color 0.2s, background 0.2s',
            transform: selected ? 'scale(1.02)' : 'scale(1)',
          }}
        >
          {selected ? (
            <>
              <span
                className="material-symbols-outlined"
                style={{ fontSize: 16, verticalAlign: 'middle', marginRight: 4 }}
              >
                check
              </span>
              Selected
            </>
          ) : (
            'Select'
          )}
        </div>
      ) : null}
    </>
  );

  if (onSelect) {
    return (
      <div
        style={cardStyle}
        onClick={() => onSelect(tier)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect(tier);
          }
        }}
      >
        {content}
      </div>
    );
  }

  return (
    <div
      style={cardStyle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {content}
    </div>
  );
}
