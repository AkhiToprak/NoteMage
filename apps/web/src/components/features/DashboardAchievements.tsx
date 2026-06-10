'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { formatAchievementDate } from '@/lib/achievement-format';
import { AchievementsError } from './AchievementsError';

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

export default function DashboardAchievements() {
  const [data, setData] = useState<AchievementsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/user/achievements')
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((res) => {
        if (!cancelled) setData(res?.data ?? res);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const retry = () => {
    setError(false);
    setLoading(true);
    setReloadKey((k) => k + 1);
  };

  if (loading) {
    return (
      <div
        className="elev-1"
        style={{
          padding: '24px',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                background: 'var(--surface-container)',
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

  if (error && !data) {
    return <AchievementsError onRetry={retry} compact />;
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
      className="elev-1"
      style={{
        padding: '24px',
      }}
    >
      <style>{`
        .dash-viewall:hover { text-decoration: underline; text-underline-offset: 3px; }
        .dash-viewall:focus-visible {
          outline: 2px solid var(--color-focus);
          outline-offset: 3px;
          border-radius: 6px;
        }
      `}</style>
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
            aria-hidden
            style={{
              fontSize: '22px',
              color: 'var(--md-h4)',
              fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24",
            }}
          >
            emoji_events
          </span>
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '18px',
              fontWeight: 700,
              color: 'var(--on-surface)',
              margin: 0,
            }}
          >
            Achievements
          </h2>
          <div
            className="tabular-nums"
            style={{
              padding: '4px 12px',
              background: 'var(--brand-purple-wash)',
              borderRadius: '20px',
              fontSize: 'var(--fs-xs)',
              fontWeight: 600,
              color: 'var(--md-h4)',
            }}
          >
            {unlockedCount} / {total}
          </div>
        </div>
        <Link
          href="/profile"
          className="dash-viewall"
          style={{
            color: 'var(--md-h4)',
            fontSize: '13px',
            fontWeight: 700,
            textDecoration: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            minHeight: 44,
            padding: '0 4px',
            marginRight: '-4px',
          }}
        >
          View all
          <span className="material-symbols-outlined" aria-hidden style={{ fontSize: '16px' }}>
            chevron_right
          </span>
        </Link>
      </div>

      {/* Recently Unlocked */}
      {recentUnlocked.length > 0 && (
        <div style={{ marginBottom: almostThere.length > 0 && !allUnlocked ? '20px' : '0' }}>
          <p
            style={{
              fontSize: 'var(--fs-xl)',
              fontWeight: 700,
              color: 'var(--on-surface)',
              margin: '0 0 10px',
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
                    background: 'var(--surface-container)',
                    borderRadius: '14px',
                    border: '1px solid var(--brand-purple-edge)',
                    flex: '1 1 0',
                    minWidth: '0',
                  }}
                >
                  <div
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '10px',
                      background: 'var(--brand-purple-wash)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <span
                      className="material-symbols-outlined"
                      aria-hidden
                      style={{
                        fontSize: '20px',
                        color: 'var(--md-h4)',
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
                        color: 'var(--on-surface)',
                        margin: 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {ach.name}
                    </p>
                    <p
                      style={{
                        fontSize: 'var(--fs-2xs)',
                        color: 'var(--text-secondary)',
                        margin: 0,
                      }}
                    >
                      {formatAchievementDate(ach.unlockedAt)}
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
            color: 'var(--on-surface-variant)',
          }}
        >
          <span
            className="material-symbols-outlined"
            aria-hidden
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
          <p style={{ fontSize: 'var(--fs-sm)', margin: 0, color: 'var(--text-secondary)' }}>
            Start studying to earn your first achievement!
          </p>
        </div>
      )}

      {/* All unlocked state */}
      {allUnlocked && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            padding: '8px 0 0',
            fontSize: '13px',
            color: 'var(--on-surface)',
            fontWeight: 600,
          }}
        >
          <span
            className="material-symbols-outlined"
            aria-hidden
            style={{ fontSize: '18px', color: 'var(--success)' }}
          >
            check_circle
          </span>
          All achievements unlocked!
        </div>
      )}

      {/* Almost There */}
      {almostThere.length > 0 && !allUnlocked && (
        <div>
          <p
            style={{
              fontSize: 'var(--fs-xl)',
              fontWeight: 700,
              color: 'var(--on-surface)',
              margin: '0 0 10px',
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
                    background: 'var(--surface-container)',
                    borderRadius: '14px',
                  }}
                >
                  <div
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '10px',
                      background: 'var(--surface-container-highest)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <span
                      className="material-symbols-outlined"
                      aria-hidden
                      style={{
                        fontSize: '20px',
                        // --outline-variant collapses into --surface-container-highest
                        // in light mode (both #b8b8c4); --outline keeps contrast in both themes.
                        color: 'var(--outline)',
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
                          color: 'var(--on-surface-variant)',
                          margin: 0,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {ach.name}
                      </p>
                      <span
                        className="tabular-nums"
                        style={{
                          fontSize: 'var(--fs-2xs)',
                          color: 'var(--text-secondary)',
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
                        background: 'var(--surface-container-highest)',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          height: '100%',
                          width: '100%',
                          transform: `scaleX(${pct / 100})`,
                          transformOrigin: 'left',
                          borderRadius: '3px',
                          background: 'var(--accent-strong)',
                          transition: 'transform 0.4s cubic-bezier(0.22,1,0.36,1)',
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
