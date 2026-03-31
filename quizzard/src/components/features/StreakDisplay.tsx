'use client';

import { useState, useEffect } from 'react';

interface StreakInfo {
  currentStreak: number;
  longestStreak: number;
  freezesLeft: number;
  isActiveToday: boolean;
}

interface StreakDisplayProps {
  onStreakLoaded?: (streak: StreakInfo) => void;
}

function getStreakColor(streak: number): string {
  if (streak >= 30) return '#ff4500';
  if (streak >= 14) return '#fd6f85';
  if (streak >= 7) return '#ff8c42';
  if (streak >= 3) return '#f0a04c';
  return '#fd6f85';
}

function getMilestone(streak: number): string | null {
  if (streak >= 365) return '365 🔥';
  if (streak >= 100) return '100 🔥';
  if (streak >= 30) return '30 🔥';
  if (streak >= 7) return '7 🔥';
  return null;
}

export default function StreakDisplay({ onStreakLoaded }: StreakDisplayProps) {
  const [streak, setStreak] = useState<StreakInfo | null>(null);
  const [showTooltip, setShowTooltip] = useState(false);

  useEffect(() => {
    fetch('/api/user/streak')
      .then((r) => r.json())
      .then((res) => {
        const data = res?.data ?? res;
        if (data?.currentStreak !== undefined) {
          setStreak(data);
          onStreakLoaded?.(data);
        }
      })
      .catch(() => {});
  }, [onStreakLoaded]);

  if (!streak) return null;

  const color = getStreakColor(streak.currentStreak);
  const milestone = getMilestone(streak.currentStreak);
  const isAtRisk = !streak.isActiveToday && streak.currentStreak > 0;

  return (
    <div
      style={{ position: 'relative', display: 'inline-block' }}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
        }}
      >
        <span
          className="material-symbols-outlined"
          style={{
            fontSize: '28px',
            color,
            fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24",
            animation: isAtRisk ? 'streak-pulse 2s ease-in-out infinite' : undefined,
          }}
        >
          local_fire_department
        </span>
      </div>

      {showTooltip && (
        <div
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 8px)',
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#1a1a2e',
            borderRadius: '12px',
            border: '1px solid rgba(140,82,255,0.2)',
            padding: '12px 16px',
            minWidth: '180px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            zIndex: 100,
            whiteSpace: 'nowrap',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', color: '#aaa8c8' }}>Current streak</span>
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#e5e3ff' }}>
                {streak.currentStreak} {streak.currentStreak === 1 ? 'day' : 'days'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', color: '#aaa8c8' }}>Longest streak</span>
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#e5e3ff' }}>
                {streak.longestStreak} {streak.longestStreak === 1 ? 'day' : 'days'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', color: '#aaa8c8' }}>Freezes left</span>
              <span style={{ fontSize: '13px', fontWeight: 700, color: streak.freezesLeft > 0 ? '#4ade80' : '#f87171' }}>
                {streak.freezesLeft}
              </span>
            </div>
            {milestone && (
              <div
                style={{
                  marginTop: '4px',
                  padding: '4px 8px',
                  background: `${color}20`,
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: 700,
                  color,
                  textAlign: 'center',
                }}
              >
                Milestone: {milestone}
              </div>
            )}
            {isAtRisk && (
              <div
                style={{
                  marginTop: '2px',
                  fontSize: '11px',
                  color: '#ffde59',
                  textAlign: 'center',
                }}
              >
                Study today to keep your streak!
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes streak-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
