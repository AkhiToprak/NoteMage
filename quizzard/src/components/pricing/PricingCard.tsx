'use client';

import { useState } from 'react';
import { TIERS, type TierKey, type FeatureType } from '@/lib/tiers';

interface PricingCardProps {
  tier: TierKey;
  selected?: boolean;
  onSelect?: (tier: TierKey) => void;
  ctaText?: string;
  ctaHref?: string;
  formattedPrice?: string;
  isRevealed?: boolean;
  delay?: number;
}

const FEATURE_LABELS: Record<FeatureType, string> = {
  ai_flashcards: 'AI Flashcard sets',
  ai_pptx: 'AI Presentations',
  ai_study_plan: 'AI Study Plans',
  scholar_chat: 'Scholar Chat messages',
};

const FEATURE_ICONS: Record<FeatureType, string> = {
  ai_flashcards: 'auto_awesome',
  ai_pptx: 'slideshow',
  ai_study_plan: 'school',
  scholar_chat: 'forum',
};

const ACCENT: Record<
  TierKey,
  { border: string; glow: string; bg: string; text: string; hoverGlow: string }
> = {
  FREE: {
    border: 'rgba(136,136,168,0.15)',
    glow: 'none',
    bg: 'rgba(22,22,48,0.6)',
    text: 'var(--on-surface-variant)',
    hoverGlow: '0 8px 32px rgba(174,137,255,0.06), 0 2px 8px rgba(0,0,0,0.3)',
  },
  PLUS: {
    border: 'rgba(174,137,255,0.3)',
    glow: '0 0 32px rgba(174,137,255,0.08)',
    bg: 'rgba(174,137,255,0.04)',
    text: 'var(--primary)',
    hoverGlow: '0 0 48px rgba(174,137,255,0.18), 0 8px 32px rgba(174,137,255,0.08)',
  },
  PRO: {
    border: 'rgba(255,222,89,0.3)',
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
  ctaText,
  ctaHref,
  formattedPrice,
  isRevealed = true,
  delay = 0,
}: PricingCardProps) {
  const config = TIERS[tier];
  const accent = ACCENT[tier];
  const isPopular = tier === 'PRO';
  const isPro = tier === 'PRO';
  const [hovered, setHovered] = useState(false);
  const [ctaHovered, setCtaHovered] = useState(false);

  const displayPrice =
    formattedPrice ?? (config.priceCHF === 0 ? 'Free' : `CHF ${config.priceCHF}`);

  const cardStyle: React.CSSProperties = {
    position: 'relative',
    background: selected
      ? accent.bg
      : isPro
        ? 'var(--surface-container)'
        : 'var(--surface-container-low)',
    border: `1px solid ${selected ? accent.text : accent.border}`,
    borderRadius: 'var(--radius-xl)',
    padding: isPro ? '40px 32px 36px' : '32px 32px 36px',
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
    flex: '1 1 0',
    minWidth: 0,
    maxWidth: 400,
    cursor: onSelect ? 'pointer' : 'default',
    boxShadow: selected ? `0 0 40px ${accent.text}33` : hovered ? accent.hoverGlow : accent.glow,
    opacity: isRevealed ? 1 : 0,
    transform: isRevealed
      ? hovered && !onSelect
        ? `translateY(-8px)${isPro ? ' scale(1.03)' : ''}`
        : isPro
          ? 'scale(1.03)'
          : 'translateY(0)'
      : 'translateY(24px)',
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
    background:
      isPro
        ? 'linear-gradient(90deg, transparent, rgba(255,222,89,0.4), transparent)'
        : isPopular
          ? 'linear-gradient(90deg, transparent, rgba(174,137,255,0.3), transparent)'
          : 'linear-gradient(90deg, transparent, rgba(136,136,168,0.15), transparent)',
    opacity: hovered || selected ? 1 : 0,
    transition: 'opacity 0.35s cubic-bezier(0.22,1,0.36,1)',
  };

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
            background: 'linear-gradient(135deg, var(--tertiary-container), #f5c542)',
            color: '#1a1a2e',
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
          fontSize: 18,
          fontWeight: 700,
          color: accent.text,
          fontFamily: 'var(--font-display)',
          letterSpacing: '-0.01em',
        }}
      >
        {config.name}
      </h3>

      {/* Price */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span
          style={{
            fontSize: 40,
            fontWeight: 800,
            color: 'var(--on-surface)',
            letterSpacing: '-0.03em',
            fontFamily: 'var(--font-display)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {displayPrice}
        </span>
        {config.priceCHF > 0 && (
          <span style={{ fontSize: 14, color: 'var(--outline)', fontWeight: 500 }}>/mo</span>
        )}
      </div>

      {/* Divider */}
      <div
        style={{
          height: 1,
          background: `linear-gradient(90deg, transparent, ${accent.border}, transparent)`,
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
          gap: 12,
          flex: 1,
        }}
      >
        {(Object.entries(config.limits) as [FeatureType, number][]).map(
          ([feature, limit], idx) => (
            <li
              key={feature}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                fontSize: 14,
                color: 'var(--on-surface-variant)',
                lineHeight: 1.4,
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{
                  fontSize: 18,
                  color: accent.text,
                  fontVariationSettings: "'FILL' 1",
                  flexShrink: 0,
                  opacity: isRevealed ? 1 : 0,
                  transform: isRevealed ? 'scale(1)' : 'scale(0.5)',
                  transition: `opacity 0.4s cubic-bezier(0.22,1,0.36,1), transform 0.4s cubic-bezier(0.22,1,0.36,1)`,
                  transitionDelay: `${delay + 200 + idx * 50}ms`,
                }}
              >
                {limit === -1 ? 'all_inclusive' : 'check_circle'}
              </span>
              <span>
                {limit === -1 ? (
                  <strong style={{ color: accent.text }}>Unlimited</strong>
                ) : (
                  limit
                )}{' '}
                {FEATURE_LABELS[feature]}
                {limit !== -1 && <span style={{ color: 'var(--outline)' }}>/mo</span>}
              </span>
            </li>
          )
        )}
      </ul>

      {/* CTA */}
      {ctaHref ? (
        <a
          href={ctaHref}
          onMouseEnter={() => setCtaHovered(true)}
          onMouseLeave={() => setCtaHovered(false)}
          style={{
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
              ? 'linear-gradient(135deg, var(--tertiary-container), #f5c542)'
              : isPopular
                ? 'linear-gradient(135deg, var(--primary), var(--primary-container))'
                : 'var(--surface-container-high)',
            color: isPro
              ? '#1a1a2e'
              : isPopular
                ? '#fff'
                : 'var(--on-surface-variant)',
            border:
              tier === 'FREE'
                ? '1px solid rgba(136,136,168,0.15)'
                : 'none',
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
          }}
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: 18, fontVariationSettings: "'FILL' 1" }}
          >
            {isPro ? 'bolt' : isPopular ? 'rocket_launch' : 'arrow_forward'}
          </span>
          {ctaText ?? 'Get Started'}
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
            border: selected
              ? `2px solid ${accent.text}`
              : '1px solid rgba(136,136,168,0.2)',
            background: selected ? accent.bg : 'transparent',
            transition:
              'transform 0.2s cubic-bezier(0.22,1,0.36,1), border-color 0.2s, color 0.2s, background 0.2s',
            transform: selected ? 'scale(1.02)' : 'scale(1)',
          }}
        >
          {selected ? '✓ Selected' : 'Select'}
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
