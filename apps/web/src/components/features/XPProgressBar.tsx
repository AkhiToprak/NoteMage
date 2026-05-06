'use client';

import LevelBadge from '@/components/features/LevelBadge';

interface XPProgressBarProps {
  currentXP: number;
  nextLevelXP: number;
  level: number;
  totalXP: number;
}

export default function XPProgressBar({
  currentXP = 0,
  nextLevelXP = 0,
  level = 1,
  totalXP = 0,
}: XPProgressBarProps) {
  const progress = nextLevelXP > 0 ? Math.min(100, Math.round((currentXP / nextLevelXP) * 100)) : 0;
  const xpNeeded = Math.max(0, nextLevelXP - currentXP);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        width: '100%',
      }}
    >
      {/* Level badge */}
      <LevelBadge level={level} size="lg" />

      {/* Progress section */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            marginBottom: '8px',
          }}
        >
          <span style={{ fontSize: '14px', fontWeight: 700, color: '#e5e3ff' }}>Level {level}</span>
          <span style={{ fontSize: '12px', color: '#aaa8c8' }}>
            {totalXP.toLocaleString()} XP total
          </span>
        </div>

        {/* Bar */}
        <div
          style={{
            height: '10px',
            width: '100%',
            background: '#272746',
            borderRadius: '5px',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${progress}%`,
              background: 'linear-gradient(90deg, #ae89ff 0%, #8348f6 100%)',
              borderRadius: '5px',
              boxShadow: progress > 0 ? '0 0 10px rgba(174,137,255,0.4)' : 'none',
              transition: 'width 0.6s cubic-bezier(0.22,1,0.36,1)',
            }}
          />
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginTop: '6px',
          }}
        >
          <span style={{ fontSize: '12px', color: '#8888a8' }}>
            {currentXP.toLocaleString()} / {nextLevelXP.toLocaleString()} XP
          </span>
          <span style={{ fontSize: '12px', color: '#8888a8' }}>
            {xpNeeded.toLocaleString()} XP to next level
          </span>
        </div>
      </div>
    </div>
  );
}
