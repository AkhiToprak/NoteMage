'use client';

import { TIERS, type TierKey } from '@/lib/tiers';

interface TierBadgeProps {
  tier: string;
  role?: string;
}

const ADMIN_BADGE = {
  label: 'Admin',
  className: 'bg-red-500/20 text-red-300 border border-red-500/40 shadow-[0_0_8px_rgba(239,68,68,0.3)]',
};

export default function TierBadge({ tier, role }: TierBadgeProps) {
  const isAdmin = role === 'admin';
  const badge = isAdmin ? ADMIN_BADGE : TIERS[(tier as TierKey) || 'FREE']?.badge;
  if (!badge) return null;

  return (
    <span
      className={badge.className}
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
      {badge.label}
    </span>
  );
}
