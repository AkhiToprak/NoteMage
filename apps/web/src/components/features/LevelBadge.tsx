'use client';

import { useState } from 'react';

interface LevelBadgeProps {
  level: number;
  size?: 'sm' | 'md' | 'lg';
}

function getTier(level: number): { name: string; color: string; bg: string } {
  if (level >= 51) return { name: 'Diamond', color: '#b9f2ff', bg: 'rgba(185,242,255,0.15)' };
  if (level >= 26) return { name: 'Gold', color: '#ffd700', bg: 'rgba(255,215,0,0.15)' };
  if (level >= 11) return { name: 'Silver', color: '#c0c0c0', bg: 'rgba(192,192,192,0.15)' };
  return { name: 'Bronze', color: '#cd7f32', bg: 'rgba(205,127,50,0.15)' };
}

const sizes = { sm: 28, md: 36, lg: 48 } as const;
const fontSizes = { sm: 12, md: 14, lg: 18 } as const;

export default function LevelBadge({ level, size = 'md' }: LevelBadgeProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const tier = getTier(level);
  const px = sizes[size];
  const fs = fontSizes[size];
  const isDiamond = level >= 51;

  return (
    <div
      style={{ position: 'relative', display: 'inline-flex' }}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <div
        style={{
          width: `${px}px`,
          height: `${px}px`,
          borderRadius: '50%',
          background: tier.bg,
          border: `2px solid ${tier.color}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          animation: isDiamond ? 'diamond-shimmer 3s ease-in-out infinite' : undefined,
        }}
      >
        <span
          style={{
            fontSize: `${fs}px`,
            fontWeight: 800,
            color: tier.color,
            lineHeight: 1,
          }}
        >
          {level}
        </span>
      </div>

      {showTooltip && (
        <div
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 8px)',
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#22223a',
            borderRadius: '8px',
            border: '1px solid rgba(140,82,255,0.2)',
            padding: '6px 12px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            zIndex: 100,
            whiteSpace: 'nowrap',
          }}
        >
          <span style={{ fontSize: '12px', fontWeight: 600, color: tier.color }}>{tier.name}</span>
        </div>
      )}

      {isDiamond && (
        <style>{`
          @keyframes diamond-shimmer {
            0%, 100% { box-shadow: 0 0 6px rgba(185,242,255,0.3); }
            50% { box-shadow: 0 0 14px rgba(185,242,255,0.6); }
          }
        `}</style>
      )}
    </div>
  );
}
