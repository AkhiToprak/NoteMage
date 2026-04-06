'use client';

import { useState, useEffect } from 'react';
import { ACHIEVEMENTS } from '@/lib/achievements';

const ICON_MAP: Record<string, string> = {
  BookOpen: 'menu_book',
  Upload: 'upload',
  Library: 'local_library',
  PenTool: 'edit_note',
  MessageSquare: 'chat',
  Brain: 'psychology',
  HelpCircle: 'quiz',
  Award: 'emoji_events',
  Layers: 'layers',
  Flame: 'local_fire_department',
  Crown: 'workspace_premium',
  UserPlus: 'person_add',
  Share2: 'share',
  Users: 'group',
};

type Category = 'all' | 'content' | 'study' | 'streak' | 'social';

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
];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

interface TrophyShelfProps {
  userId?: string;
}

export default function TrophyShelf({ userId }: TrophyShelfProps = {}) {
  const [activeTab, setActiveTab] = useState<Category>('all');
  const [data, setData] = useState<AchievementsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedBadge, setExpandedBadge] = useState<string | null>(null);

  useEffect(() => {
    const url = userId
      ? `/api/user/achievements?userId=${encodeURIComponent(userId)}`
      : '/api/user/achievements';
    fetch(url)
      .then((r) => r.json())
      .then((res) => {
        const d = res?.data ?? res;
        setData(d);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userId]);

  const unlockedSet = new Set(data?.unlocked?.map((u) => u.badge) ?? []);
  const unlockedMap = new Map(data?.unlocked?.map((u) => [u.badge, u]) ?? []);
  const progressMap = new Map(data?.progress?.map((p) => [p.badge, p]) ?? []);

  const filtered = ACHIEVEMENTS.filter(
    (a) => activeTab === 'all' || a.category === activeTab
  );

  const totalUnlocked = ACHIEVEMENTS.filter((a) => unlockedSet.has(a.badge)).length;
  const totalCount = ACHIEVEMENTS.length;

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              background: '#161630',
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span
            className="material-symbols-outlined"
            style={{
              fontSize: '28px',
              color: '#ae89ff',
              fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24",
            }}
          >
            emoji_events
          </span>
          <h2
            style={{
              fontFamily: 'var(--font-brand)',
              fontSize: '22px',
              fontWeight: 400,
              color: '#e5e3ff',
              margin: 0,
            }}
          >
            Achievements
          </h2>
        </div>
        <div
          style={{
            padding: '6px 14px',
            background: 'rgba(174,137,255,0.12)',
            borderRadius: '20px',
            fontSize: '13px',
            fontWeight: 600,
            color: '#ae89ff',
          }}
        >
          {totalUnlocked} / {totalCount} unlocked
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {CATEGORIES.map((cat) => {
          const isActive = activeTab === cat.key;
          return (
            <button
              key={cat.key}
              onClick={() => setActiveTab(cat.key)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                borderRadius: '12px',
                border: isActive
                  ? '1px solid rgba(174,137,255,0.4)'
                  : '1px solid rgba(170,168,200,0.15)',
                background: isActive ? 'rgba(174,137,255,0.15)' : 'rgba(22,22,48,0.6)',
                color: isActive ? '#ae89ff' : '#aaa8c8',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'transform 0.2s cubic-bezier(0.22,1,0.36,1), background 0.2s cubic-bezier(0.22,1,0.36,1)',
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = 'rgba(174,137,255,0.08)';
                  e.currentTarget.style.color = '#e5e3ff';
                }
                e.currentTarget.style.transform = 'scale(1.03)';
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = 'rgba(22,22,48,0.6)';
                  e.currentTarget.style.color = '#aaa8c8';
                }
                e.currentTarget.style.transform = 'scale(1)';
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
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
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '14px',
        }}
      >
        {filtered.map((achievement) => {
          const isUnlocked = unlockedSet.has(achievement.badge);
          const unlockInfo = unlockedMap.get(achievement.badge);
          const progress = progressMap.get(achievement.badge);
          const isExpanded = expandedBadge === achievement.badge;
          const materialIcon = ICON_MAP[achievement.icon] || 'emoji_events';

          return (
            <div
              key={achievement.badge}
              onClick={() =>
                setExpandedBadge(isExpanded ? null : achievement.badge)
              }
              style={{
                background: isUnlocked ? '#161630' : '#1a1a30',
                borderRadius: '16px',
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                gap: '10px',
                cursor: 'pointer',
                border: isUnlocked
                  ? '1px solid rgba(174,137,255,0.2)'
                  : '1px solid rgba(58,58,92,0.4)',
                boxShadow: isUnlocked
                  ? '0 0 20px rgba(174,137,255,0.08)'
                  : 'none',
                transition:
                  'transform 0.2s cubic-bezier(0.22,1,0.36,1), box-shadow 0.2s cubic-bezier(0.22,1,0.36,1)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.03)';
                if (isUnlocked) {
                  e.currentTarget.style.boxShadow =
                    '0 0 28px rgba(174,137,255,0.15)';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
                if (isUnlocked) {
                  e.currentTarget.style.boxShadow =
                    '0 0 20px rgba(174,137,255,0.08)';
                }
              }}
            >
              {/* Icon */}
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '14px',
                  background: isUnlocked
                    ? 'rgba(174,137,255,0.15)'
                    : '#3a3a5c',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{
                    fontSize: '24px',
                    color: isUnlocked ? '#ae89ff' : '#6a6a8c',
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
                style={{
                  fontSize: '14px',
                  fontWeight: 700,
                  color: isUnlocked ? '#e5e3ff' : '#6a6a8c',
                  lineHeight: 1.3,
                }}
              >
                {achievement.name}
              </span>

              {/* Unlock date or progress bar */}
              {isUnlocked && unlockInfo ? (
                <span style={{ fontSize: '11px', color: '#8888a8' }}>
                  {formatDate(unlockInfo.unlockedAt)}
                </span>
              ) : (
                <div style={{ width: '100%' }}>
                  <div
                    style={{
                      height: '6px',
                      borderRadius: '3px',
                      background: '#2a2a4c',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        width: `${
                          progress
                            ? Math.min(
                                (progress.current / progress.target) * 100,
                                100
                              )
                            : 0
                        }%`,
                        borderRadius: '3px',
                        background:
                          'linear-gradient(90deg, #ae89ff, #8348f6)',
                        transition:
                          'width 0.4s cubic-bezier(0.22,1,0.36,1)',
                      }}
                    />
                  </div>
                  <span
                    style={{
                      fontSize: '11px',
                      color: '#6a6a8c',
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
                    background: 'rgba(42,42,76,0.5)',
                    borderRadius: '10px',
                    fontSize: '12px',
                    lineHeight: 1.5,
                    color: '#aaa8c8',
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
                        color: '#4ade80',
                        fontSize: '11px',
                        fontWeight: 600,
                      }}
                    >
                      <span
                        className="material-symbols-outlined"
                        style={{ fontSize: '14px' }}
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
