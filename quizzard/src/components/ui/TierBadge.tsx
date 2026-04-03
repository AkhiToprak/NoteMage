'use client';

import { TIERS, type TierKey } from '@/lib/tiers';

interface TierBadgeProps {
  tier: string;
}

export default function TierBadge({ tier }: TierBadgeProps) {
  const tierKey = (tier as TierKey) || 'FREE';
  const config = TIERS[tierKey];
  if (!config) return null;

  return (
    <span
      className={config.badge.className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        fontSize: '11px',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        padding: '2px 8px',
        borderRadius: '6px',
        lineHeight: '18px',
        whiteSpace: 'nowrap',
      }}
    >
      {config.badge.label}
    </span>
  );
}
