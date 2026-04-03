'use client';

import { TIERS, type TierKey, type FeatureType } from '@/lib/tiers';

interface PricingCardProps {
  tier: TierKey;
  selected?: boolean;
  onSelect?: (tier: TierKey) => void;
  ctaText?: string;
  ctaHref?: string;
  formattedPrice?: string;
}

const FEATURE_LABELS: Record<FeatureType, string> = {
  ai_flashcards: 'AI Flashcard sets',
  ai_pptx: 'AI Presentations',
  ai_study_plan: 'AI Study Plans',
  scholar_chat: 'Scholar Chat messages',
};

const ACCENT: Record<TierKey, { border: string; glow: string; bg: string; text: string }> = {
  FREE: {
    border: 'rgba(255,255,255,0.08)',
    glow: 'none',
    bg: 'rgba(255,255,255,0.03)',
    text: '#aaa8c8',
  },
  PLUS: {
    border: 'rgba(174,137,255,0.4)',
    glow: '0 0 32px rgba(174,137,255,0.15)',
    bg: 'rgba(174,137,255,0.06)',
    text: '#ae89ff',
  },
  PRO: {
    border: 'rgba(255,222,89,0.4)',
    glow: '0 0 32px rgba(255,222,89,0.12)',
    bg: 'rgba(255,222,89,0.06)',
    text: '#ffde59',
  },
};

export default function PricingCard({
  tier,
  selected = false,
  onSelect,
  ctaText,
  ctaHref,
  formattedPrice,
}: PricingCardProps) {
  const config = TIERS[tier];
  const accent = ACCENT[tier];
  const isPopular = tier === 'PLUS';

  const displayPrice = formattedPrice ?? (config.priceCHF === 0 ? 'Free' : `CHF ${config.priceCHF}`);

  const cardStyle: React.CSSProperties = {
    position: 'relative',
    background: selected ? accent.bg : 'rgba(22,22,48,0.8)',
    border: `2px solid ${selected ? accent.text : accent.border}`,
    borderRadius: '20px',
    padding: '28px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    flex: '1 1 0',
    minWidth: '200px',
    maxWidth: '320px',
    cursor: onSelect ? 'pointer' : 'default',
    boxShadow: selected ? `0 0 40px ${accent.text}33` : accent.glow,
    transition: 'border-color 0.25s cubic-bezier(0.22,1,0.36,1), box-shadow 0.25s cubic-bezier(0.22,1,0.36,1), background 0.25s cubic-bezier(0.22,1,0.36,1)',
  };

  const content = (
    <>
      {/* Popular badge */}
      {isPopular && (
        <div
          style={{
            position: 'absolute',
            top: '-12px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'linear-gradient(135deg, #ae89ff, #8b5cf6)',
            color: '#fff',
            fontSize: '11px',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            padding: '4px 16px',
            borderRadius: '20px',
            whiteSpace: 'nowrap',
          }}
        >
          Popular
        </div>
      )}

      {/* Tier name */}
      <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: accent.text }}>
        {config.name}
      </h3>

      {/* Price */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
        <span style={{ fontSize: '36px', fontWeight: 800, color: '#fff', letterSpacing: '-0.03em' }}>
          {displayPrice}
        </span>
        {config.priceCHF > 0 && (
          <span style={{ fontSize: '14px', color: '#8888a8' }}>/month</span>
        )}
      </div>

      {/* Features list */}
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {(Object.entries(config.limits) as [FeatureType, number][]).map(([feature, limit]) => (
          <li
            key={feature}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '14px',
              color: '#cccae0',
            }}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: '16px', color: accent.text, fontVariationSettings: "'FILL' 1" }}
            >
              check_circle
            </span>
            {limit === -1 ? 'Unlimited' : limit} {FEATURE_LABELS[feature]}{limit === -1 ? '' : '/mo'}
          </li>
        ))}
      </ul>

      {/* CTA */}
      {ctaHref ? (
        <a
          href={ctaHref}
          style={{
            display: 'block',
            textAlign: 'center',
            padding: '12px 24px',
            borderRadius: '12px',
            fontWeight: 700,
            fontSize: '14px',
            textDecoration: 'none',
            background: tier === 'PRO'
              ? 'linear-gradient(135deg, #ffde59, #f5c542)'
              : tier === 'PLUS'
              ? 'linear-gradient(135deg, #ae89ff, #8b5cf6)'
              : 'rgba(255,255,255,0.08)',
            color: tier === 'FREE' ? '#cccae0' : tier === 'PRO' ? '#1a1a2e' : '#fff',
            transition: 'opacity 0.2s',
          }}
        >
          {ctaText ?? 'Get Started'}
        </a>
      ) : onSelect ? (
        <div
          style={{
            textAlign: 'center',
            padding: '10px',
            borderRadius: '12px',
            fontWeight: 600,
            fontSize: '13px',
            color: selected ? accent.text : '#8888a8',
            border: selected ? `1px solid ${accent.text}` : '1px solid rgba(255,255,255,0.08)',
            transition: 'color 0.2s, border-color 0.2s',
          }}
        >
          {selected ? '✓ Selected' : 'Select'}
        </div>
      ) : null}
    </>
  );

  if (onSelect) {
    return (
      <div style={cardStyle} onClick={() => onSelect(tier)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(tier); } }}>
        {content}
      </div>
    );
  }

  return <div style={cardStyle}>{content}</div>;
}
