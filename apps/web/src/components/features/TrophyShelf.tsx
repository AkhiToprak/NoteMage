'use client';

import { useState, useEffect } from 'react';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { ACHIEVEMENTS } from '@/lib/achievements';
import { Mascot } from '@/components/mascot';
import { formatAchievementDate } from '@/lib/achievement-format';
import { AchievementsError } from './AchievementsError';

type Category = 'all' | 'content' | 'study' | 'streak' | 'social' | 'special';

interface UnlockedAchievement {
  badge: string;
  unlockedAt: string;
}

interface AchievementProgress {
  badge: string;
  current: number;
  target: number;
}

interface AchievementsResponse {
  unlocked: UnlockedAchievement[];
  progress: AchievementProgress[];
}

const CATEGORIES: { key: Category; label: string; icon: string }[] = [
  { key: 'all', label: 'All', icon: 'grid_view' },
  { key: 'content', label: 'Content', icon: 'menu_book' },
  { key: 'study', label: 'Study', icon: 'psychology' },
  { key: 'streak', label: 'Streak', icon: 'local_fire_department' },
  { key: 'social', label: 'Social', icon: 'group' },
  { key: 'special', label: 'Special', icon: 'auto_awesome' },
];

interface TrophyShelfProps {
  userId?: string;
}

export default function TrophyShelf({ userId }: TrophyShelfProps) {
  const { isPhone } = useBreakpoint();
  const [activeTab, setActiveTab] = useState<Category>('all');
  const [data, setData] = useState<AchievementsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [expandedBadge, setExpandedBadge] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const url = userId
      ? `/api/user/achievements?userId=${encodeURIComponent(userId)}`
      : '/api/user/achievements';
    fetch(url)
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
  }, [userId, reloadKey]);

  const retry = () => {
    setError(false);
    setLoading(true);
    setReloadKey((k) => k + 1);
  };

  const unlockedSet = new Set(data?.unlocked?.map((u) => u.badge) ?? []);
  const unlockedMap = new Map(data?.unlocked?.map((u) => [u.badge, u]) ?? []);
  const progressMap = new Map(data?.progress?.map((p) => [p.badge, p]) ?? []);

  const filtered = ACHIEVEMENTS.filter((a) => activeTab === 'all' || a.category === activeTab);

  const totalUnlocked = ACHIEVEMENTS.filter((a) => unlockedSet.has(a.badge)).length;
  const totalCount = ACHIEVEMENTS.length;

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              background: 'var(--surface-container-low)',
              borderRadius: '16px',
              height: '80px',
              animation: 'trophy-pulse 1.5s ease-in-out infinite',
              animationDelay: `${i * 0.15}s`,
              opacity: 0.5,
            }}
          />
        ))}
        <style>{`
          @keyframes trophy-pulse {
            0%, 100% { opacity: 0.3; }
            50% { opacity: 0.6; }
          }
        `}</style>
      </div>
    );
  }

  if (error && !data) {
    return <AchievementsError onRetry={retry} />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <style>{`
        .ach-tab:focus-visible,
        .trophy-tile:focus-visible {
          outline: 2px solid var(--color-focus);
          outline-offset: 2px;
        }
        @media (prefers-reduced-motion: reduce) {
          .trophy-tile { transition: none !important; }
        }
      `}</style>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span
            className="material-symbols-outlined"
            aria-hidden
            style={{
              fontSize: '28px',
              color: 'var(--md-h4)',
              fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24",
            }}
          >
            emoji_events
          </span>
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'var(--fs-xl)',
              fontWeight: 700,
              color: 'var(--on-surface)',
              margin: 0,
            }}
          >
            Achievements
          </h2>
        </div>
        <div
          className="tabular-nums"
          style={{
            padding: '6px 14px',
            background: 'var(--brand-purple-wash)',
            borderRadius: '20px',
            fontSize: 'var(--fs-sm)',
            fontWeight: 600,
            color: 'var(--md-h4)',
          }}
        >
          {totalUnlocked} / {totalCount} unlocked
        </div>
      </div>

      {totalUnlocked === 0 && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '10px',
            padding: '20px 12px',
            textAlign: 'center',
            color: 'var(--text-secondary)',
            fontSize: 'var(--fs-sm)',
          }}
        >
          <Mascot pose="sleeping" size="md" idle="sway" />
          No achievements unlocked yet — start studying to earn your first.
        </div>
      )}

      {/* Tabs */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          flexWrap: isPhone ? 'nowrap' : 'wrap',
          overflowX: isPhone ? 'auto' : undefined,
          WebkitOverflowScrolling: isPhone ? 'touch' : undefined,
          scrollbarWidth: isPhone ? 'none' : undefined,
          paddingBottom: isPhone ? 2 : undefined,
        }}
      >
        {CATEGORIES.map((cat) => {
          const isActive = activeTab === cat.key;
          return (
            <button
              key={cat.key}
              type="button"
              className="ach-tab"
              aria-pressed={isActive}
              onClick={() => setActiveTab(cat.key)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: isPhone ? '8px 14px' : '8px 16px',
                minHeight: isPhone ? 44 : undefined,
                borderRadius: '12px',
                border: isActive
                  ? '1px solid var(--brand-purple-edge)'
                  : '1px solid var(--rule-hairline)',
                background: isActive ? 'var(--brand-purple-hover)' : 'var(--surface-container-high)',
                color: isActive ? 'var(--md-h4)' : 'var(--on-surface-variant)',
                fontSize: isPhone ? '12px' : '13px',
                fontWeight: 600,
                cursor: 'pointer',
                transition:
                  'transform 0.2s cubic-bezier(0.22,1,0.36,1), background 0.2s cubic-bezier(0.22,1,0.36,1)',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = 'var(--brand-purple-wash)';
                  e.currentTarget.style.color = 'var(--on-surface)';
                }
                e.currentTarget.style.transform = 'scale(1.03)';
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = 'var(--surface-container-high)';
                  e.currentTarget.style.color = 'var(--on-surface-variant)';
                }
                e.currentTarget.style.transform = 'scale(1)';
              }}
            >
              <span className="material-symbols-outlined" aria-hidden style={{ fontSize: '16px' }}>
                {cat.icon}
              </span>
              {cat.label}
            </button>
          );
        })}
      </div>

      {/* Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isPhone ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)',
          gap: isPhone ? '10px' : '14px',
        }}
      >
        {filtered.map((achievement) => {
          const isUnlocked = unlockedSet.has(achievement.badge);
          const unlockInfo = unlockedMap.get(achievement.badge);
          const progress = progressMap.get(achievement.badge);
          const isExpanded = expandedBadge === achievement.badge;
          const materialIcon = achievement.icon;
          // Rarity beat: the one-off "special" achievements wear a gold accent
          // instead of the default brand purple, so a rare unlock doesn't look
          // identical to a common one.
          const isRare = achievement.category === 'special';
          const accentInk = isRare ? 'var(--warning)' : 'var(--md-h4)';
          const accentWash = isRare
            ? 'rgb(var(--achievement-gold-rgb) / 0.16)'
            : 'var(--brand-purple-wash)';
          const hoverGlow = isRare
            ? '0 0 28px rgb(var(--achievement-gold-rgb) / 0.18)'
            : '0 0 28px rgb(var(--brand-purple-rgb) / 0.15)';
          const toggle = () => setExpandedBadge(isExpanded ? null : achievement.badge);

          return (
            <div
              key={achievement.badge}
              className="elev-1 elev-interactive trophy-tile"
              role="button"
              tabIndex={0}
              aria-expanded={isExpanded}
              aria-label={`${achievement.name}, ${isUnlocked ? 'unlocked' : 'locked'}. ${
                isExpanded ? 'Hide details' : 'Show details'
              }`}
              onClick={toggle}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  toggle();
                }
              }}
              style={{
                padding: isPhone ? '14px 10px' : '20px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                gap: isPhone ? '8px' : '10px',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => {
                if (isUnlocked) {
                  e.currentTarget.style.boxShadow = hoverGlow;
                }
              }}
              onMouseLeave={(e) => {
                if (isUnlocked) {
                  e.currentTarget.style.boxShadow = '';
                }
              }}
            >
              {/* Icon */}
              <div
                style={{
                  width: isPhone ? '40px' : '48px',
                  height: isPhone ? '40px' : '48px',
                  borderRadius: isPhone ? '10px' : '14px',
                  background: isUnlocked ? accentWash : 'var(--surface-container-high)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span
                  className="material-symbols-outlined"
                  aria-hidden
                  style={{
                    fontSize: isPhone ? '20px' : '24px',
                    color: isUnlocked ? accentInk : 'var(--outline)',
                    fontVariationSettings: isUnlocked
                      ? "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24"
                      : "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24",
                  }}
                >
                  {materialIcon}
                </span>
              </div>

              {/* Name */}
              <span
                title={achievement.name}
                style={{
                  fontSize: isPhone ? 'var(--fs-xs)' : 'var(--fs-sm)',
                  fontWeight: 700,
                  color: isUnlocked ? 'var(--on-surface)' : 'var(--outline)',
                  lineHeight: 1.3,
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  overflowWrap: 'anywhere',
                }}
              >
                {achievement.name}
              </span>

              {/* Unlock date or progress bar */}
              {isUnlocked && unlockInfo ? (
                <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-secondary)' }}>
                  {formatAchievementDate(unlockInfo.unlockedAt, { withYear: true })}
                </span>
              ) : (
                <div style={{ width: '100%' }}>
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
                        transform: `scaleX(${
                          progress ? Math.min(progress.current / progress.target, 1) : 0
                        })`,
                        transformOrigin: 'left',
                        borderRadius: '3px',
                        background: 'var(--accent-strong)',
                        transition: 'transform 0.4s cubic-bezier(0.22,1,0.36,1)',
                      }}
                    />
                  </div>
                  <span
                    className="tabular-nums"
                    style={{
                      fontSize: 'var(--fs-2xs)',
                      color: 'var(--text-secondary)',
                      marginTop: '4px',
                      display: 'block',
                    }}
                  >
                    {progress ? `${progress.current} / ${progress.target}` : '0 / ?'}
                  </span>
                </div>
              )}

              {/* Expanded detail */}
              {isExpanded && (
                <div
                  style={{
                    width: '100%',
                    marginTop: '4px',
                    padding: '10px',
                    background: 'var(--surface-container-low)',
                    borderRadius: '10px',
                    fontSize: '12px',
                    lineHeight: 1.5,
                    color: 'var(--on-surface-variant)',
                  }}
                >
                  {achievement.description}
                  {isUnlocked && (
                    <div
                      style={{
                        marginTop: '6px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '4px',
                        color: 'var(--on-surface)',
                        fontSize: '11px',
                        fontWeight: 600,
                      }}
                    >
                      <span
                        className="material-symbols-outlined"
                        aria-hidden
                        style={{ fontSize: '14px', color: 'var(--success)' }}
                      >
                        check_circle
                      </span>
                      Unlocked
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
