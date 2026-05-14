'use client';

import { useState, useEffect } from 'react';
import { useCelebration } from '@/components/mascot';

const STREAK_MILESTONES = [3, 7, 30, 100, 365] as const;

function streakMilestoneFor(n: number): number | null {
  let hit: number | null = null;
  for (const m of STREAK_MILESTONES) {
    if (n >= m) hit = m;
  }
  return hit;
}

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

function streakCopyFor(milestone: number): { headline: string; subtext: string } {
  switch (milestone) {
    case 365:
      return {
        headline: 'A whole year in a row!',
        subtext: "365 days of showing up. You've built a habit that sticks.",
      };
    case 100:
      return {
        headline: '100-day streak!',
        subtext: 'Triple digits. You make this look easy.',
      };
    case 30:
      return {
        headline: '30-day streak!',
        subtext: 'A month of consistency. The mage is impressed.',
      };
    case 7:
      return {
        headline: 'One week streak!',
        subtext: 'Seven days strong. Keep the fire alive.',
      };
    case 3:
    default:
      return {
        headline: '3-day streak!',
        subtext: "You're warming up. Don't stop now.",
      };
  }
}

export default function StreakDisplay({ onStreakLoaded }: StreakDisplayProps) {
  const [streak, setStreak] = useState<StreakInfo | null>(null);
  const [showTooltip, setShowTooltip] = useState(false);
  const { celebrate } = useCelebration();

  useEffect(() => {
    fetch('/api/user/streak')
      .then((r) => r.json())
      .then((res) => {
        const data = res?.data ?? res;
        if (data?.currentStreak === undefined) return;

        const milestone = streakMilestoneFor(data.currentStreak);
        let shouldCelebrate = false;
        if (milestone !== null && typeof window !== 'undefined') {
          const key = `streak-celebrated-${milestone}`;
          try {
            if (!window.sessionStorage.getItem(key)) {
              window.sessionStorage.setItem(key, '1');
              shouldCelebrate = true;
            }
          } catch {
            // sessionStorage unavailable (private mode, etc.) — skip the celebration.
          }
        }

        setStreak(data);
        if (shouldCelebrate && milestone !== null) {
          const copy = streakCopyFor(milestone);
          celebrate({
            pose: 'celebrate',
            size: 'lg',
            oneShot: 'celebrate',
            eyebrow: 'Streak',
            headline: copy.headline,
            subtext: copy.subtext,
            accentColor: getStreakColor(milestone),
            accentFill: 'rgba(255, 140, 66, 0.14)',
          });
        }
        onStreakLoaded?.(data);
      })
      .catch(() => {});
  }, [onStreakLoaded, celebrate]);

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
            background: '#22223a',
            borderRadius: '12px',
            border: '1px solid rgba(174,137,255,0.40)',
            padding: '12px 16px',
            minWidth: '180px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            zIndex: 100,
            whiteSpace: 'nowrap',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', color: 'var(--on-surface-variant)' }}>Current streak</span>
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--on-surface)' }}>
                {streak.currentStreak} {streak.currentStreak === 1 ? 'day' : 'days'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', color: 'var(--on-surface-variant)' }}>Longest streak</span>
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--on-surface)' }}>
                {streak.longestStreak} {streak.longestStreak === 1 ? 'day' : 'days'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', color: 'var(--on-surface-variant)' }}>Freezes left</span>
              <span
                style={{
                  fontSize: '13px',
                  fontWeight: 700,
                  color: streak.freezesLeft > 0 ? '#4ade80' : '#f87171',
                }}
              >
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
