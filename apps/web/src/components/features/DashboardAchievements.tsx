'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ACHIEVEMENTS } from '@/lib/achievements';

interface UnlockedAchievement {
  badge: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  unlockedAt: string;
}

interface LockedAchievement {
  badge: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  progress: { current: number; target: number };
}

interface AchievementsData {
  unlocked: UnlockedAchievement[];
  locked: LockedAchievement[];
  total: number;
  unlockedCount: number;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

export default function DashboardAchievements() {
  const [data, setData] = useState<AchievementsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/user/achievements')
      .then((r) => r.json())
      .then((res) => setData(res?.data ?? res))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div
        style={{
          background: '#21213e',
          borderRadius: '20px',
          padding: '24px',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                background: '#272746',
                borderRadius: '14px',
                height: '56px',
                animation: 'dash-ach-pulse 1.5s ease-in-out infinite',
                animationDelay: `${i * 0.15}s`,
                opacity: 0.5,
              }}
            />
          ))}
        </div>
        <style>{`
          @keyframes dash-ach-pulse {
            0%, 100% { opacity: 0.3; }
            50% { opacity: 0.6; }
          }
        `}</style>
      </div>
    );
  }

  if (!data) return null;

  const { unlocked, locked, total, unlockedCount } = data;
  const allUnlocked = unlockedCount === total;

  // Recently unlocked: up to 3, already sorted by unlockedAt desc from API
  const recentUnlocked = unlocked.slice(0, 3);

  // Almost there: up to 3 locked achievements sorted by progress % descending
  const almostThere = [...locked]
    .map((item) => ({
      ...item,
      pct: item.progress.target > 0 ? item.progress.current / item.progress.target : 0,
    }))
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 3);

  return (
    <div
      style={{
        background: '#21213e',
        borderRadius: '20px',
        padding: '24px',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '20px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span
            className="material-symbols-outlined"
            style={{
              fontSize: '22px',
              color: '#ae89ff',
              fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24",
            }}
          >
            emoji_events
          </span>
          <h2
            style={{
              fontSize: '18px',
              fontWeight: 700,
              color: '#e5e3ff',
              margin: 0,
            }}
          >
            Achievements
          </h2>
          <div
            style={{
              padding: '4px 12px',
              background: 'rgba(174,137,255,0.12)',
              borderRadius: '20px',
              fontSize: '12px',
              fontWeight: 600,
              color: '#ae89ff',
            }}
          >
            {unlockedCount} / {total}
          </div>
        </div>
        <Link
          href="/profile"
          style={{
            color: '#ae89ff',
            fontSize: '13px',
            fontWeight: 700,
            textDecoration: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          View all
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
            chevron_right
          </span>
        </Link>
      </div>

      {/* Recently Unlocked */}
      {recentUnlocked.length > 0 && (
        <div style={{ marginBottom: almostThere.length > 0 && !allUnlocked ? '20px' : '0' }}>
          <p
            style={{
              fontSize: '12px',
              fontWeight: 600,
              color: '#8888a8',
              margin: '0 0 10px',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            Recently Unlocked
          </p>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {recentUnlocked.map((ach) => {
              const materialIcon = ach.icon;
              return (
                <div
                  key={ach.badge}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '10px 14px',
                    background: '#272746',
                    borderRadius: '14px',
                    border: '1px solid rgba(174,137,255,0.15)',
                    flex: '1 1 0',
                    minWidth: '0',
                  }}
                >
                  <div
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '10px',
                      background: 'rgba(174,137,255,0.15)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <span
                      className="material-symbols-outlined"
                      style={{
                        fontSize: '20px',
                        color: '#ae89ff',
                        fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24",
                      }}
                    >
                      {materialIcon}
                    </span>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <p
                      style={{
                        fontSize: '13px',
                        fontWeight: 700,
                        color: '#e5e3ff',
                        margin: 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {ach.name}
                    </p>
                    <p style={{ fontSize: '11px', color: '#8888a8', margin: 0 }}>
                      {formatDate(ach.unlockedAt)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty state */}
      {recentUnlocked.length === 0 && !allUnlocked && (
        <div
          style={{
            textAlign: 'center',
            padding: '24px 0',
            color: '#aaa8c8',
          }}
        >
          <span
            className="material-symbols-outlined"
            style={{
              fontSize: '36px',
              display: 'block',
              marginBottom: '8px',
              opacity: 0.3,
              fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24",
            }}
          >
            emoji_events
          </span>
          <p style={{ fontSize: '13px', margin: 0, color: '#8888a8' }}>
            Start studying to earn your first achievement!
          </p>
        </div>
      )}

      {/* All unlocked state */}
      {allUnlocked && (
        <div
          style={{
            textAlign: 'center',
            padding: '8px 0 0',
            fontSize: '13px',
            color: '#4ade80',
            fontWeight: 600,
          }}
        >
          All achievements unlocked!
        </div>
      )}

      {/* Almost There */}
      {almostThere.length > 0 && !allUnlocked && (
        <div>
          <p
            style={{
              fontSize: '12px',
              fontWeight: 600,
              color: '#8888a8',
              margin: '0 0 10px',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            Almost There
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {almostThere.map((ach) => {
              const materialIcon = ach.icon;
              const pct = Math.min(ach.pct * 100, 100);
              return (
                <div
                  key={ach.badge}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '10px 14px',
                    background: '#272746',
                    borderRadius: '14px',
                  }}
                >
                  <div
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '10px',
                      background: '#35355c',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <span
                      className="material-symbols-outlined"
                      style={{
                        fontSize: '20px',
                        color: '#6a6a8c',
                        fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24",
                      }}
                    >
                      {materialIcon}
                    </span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '6px',
                      }}
                    >
                      <p
                        style={{
                          fontSize: '13px',
                          fontWeight: 700,
                          color: '#aaa8c8',
                          margin: 0,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {ach.name}
                      </p>
                      <span
                        style={{
                          fontSize: '11px',
                          color: '#6a6a8c',
                          flexShrink: 0,
                          marginLeft: '8px',
                        }}
                      >
                        {ach.progress.current} / {ach.progress.target}
                      </span>
                    </div>
                    <div
                      style={{
                        height: '6px',
                        borderRadius: '3px',
                        background: '#35355c',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          height: '100%',
                          width: `${pct}%`,
                          borderRadius: '3px',
                          background: 'linear-gradient(90deg, #ae89ff, #8348f6)',
                          transition: 'width 0.4s cubic-bezier(0.22,1,0.36,1)',
                        }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
