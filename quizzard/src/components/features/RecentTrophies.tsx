'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { ACHIEVEMENTS } from '@/lib/achievements';

// Lazy-load the full grid — most viewers never expand it, so this keeps
// the initial trophy-board card lean.
const TrophyShelf = dynamic(() => import('./TrophyShelf'), { ssr: false });

interface UnlockedAchievement {
  badge: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  unlockedAt: string;
}

interface AchievementsResponse {
  unlocked: UnlockedAchievement[];
  unlockedCount?: number;
  total?: number;
}

interface RecentTrophiesProps {
  userId: string;
}

const PREVIEW_COUNT = 4;

function formatEarnedDate(iso: string): string {
  return new Date(iso)
    .toLocaleDateString('en-US', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
    .toUpperCase();
}

/**
 * Trophy Board card on the public profile. Renders the 4 most recently
 * unlocked achievements as a list (icon + name + description + earned date)
 * and toggles to embed the full TrophyShelf inline when "View All" is
 * clicked. The viewer never has to leave the profile page to browse the
 * full set.
 */
export default function RecentTrophies({ userId }: RecentTrophiesProps) {
  const { isPhone } = useBreakpoint();
  const [data, setData] = useState<AchievementsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetch(`/api/user/achievements?userId=${encodeURIComponent(userId)}`)
      .then((r) => r.json())
      .then((res) => {
        const d = res?.data ?? res;
        setData(d);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userId]);

  const recent = (data?.unlocked ?? []).slice(0, PREVIEW_COUNT);
  const unlockedCount = data?.unlockedCount ?? data?.unlocked?.length ?? 0;
  const totalCount = data?.total ?? ACHIEVEMENTS.length;

  // When expanded, drop the wrapper card so the TrophyShelf's own card
  // doesn't visually nest inside ours. We keep the header row (so the
  // "Hide" button stays reachable) but render it without padding/background.
  const wrapperStyle: React.CSSProperties = expanded
    ? {
        background: 'transparent',
        padding: 0,
        borderRadius: 0,
      }
    : {
        background: '#21213e',
        padding: isPhone ? '22px 20px' : '28px 32px',
        borderRadius: isPhone ? 20 : 24,
      };

  return (
    <div
      style={{
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        ...wrapperStyle,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
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
          <h3
            style={{
              fontSize: '11px',
              fontWeight: 700,
              color: '#8888a8',
              margin: 0,
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
            }}
          >
            Trophy Board
          </h3>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            background: 'transparent',
            border: 'none',
            color: '#ae89ff',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'inherit',
            padding: '6px 4px',
            borderRadius: '8px',
            transition: 'transform 0.2s cubic-bezier(0.22,1,0.36,1)',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.transform = 'translateX(2px)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.transform = 'translateX(0)';
          }}
        >
          {expanded ? 'Hide' : `View All ${totalCount} Achievements`}
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
            {expanded ? 'expand_less' : 'chevron_right'}
          </span>
        </button>
      </div>

      {/* Body */}
      {expanded ? (
        <TrophyShelf userId={userId} />
      ) : loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              style={{
                height: isPhone ? '64px' : '72px',
                borderRadius: '14px',
                background: 'rgba(174,137,255,0.05)',
                animation: 'recent-trophy-pulse 1.5s ease-in-out infinite',
                animationDelay: `${i * 0.12}s`,
              }}
            />
          ))}
          <style>{`
            @keyframes recent-trophy-pulse {
              0%, 100% { opacity: 0.35; }
              50% { opacity: 0.65; }
            }
          `}</style>
        </div>
      ) : recent.length === 0 ? (
        <div
          style={{
            padding: '24px 12px',
            textAlign: 'center',
            color: '#8888a8',
            fontSize: '13px',
          }}
        >
          <span
            className="material-symbols-outlined"
            style={{
              fontSize: '32px',
              display: 'block',
              marginBottom: '8px',
              opacity: 0.5,
              color: '#6a6a8c',
            }}
          >
            emoji_events
          </span>
          No achievements unlocked yet.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {recent.map((a, idx) => (
            <TrophyRow
              key={a.badge}
              achievement={a}
              isPhone={isPhone}
              isLast={idx === recent.length - 1}
            />
          ))}
        </div>
      )}

      {/* Footer count line — only when collapsed and we have data */}
      {!expanded && !loading && recent.length > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            fontSize: '11px',
            color: '#8888a8',
            fontWeight: 600,
            letterSpacing: '0.04em',
            paddingTop: '4px',
            borderTop: '1px solid rgba(170,168,200,0.08)',
          }}
        >
          <span>
            <span style={{ color: '#ae89ff', fontWeight: 700 }}>{unlockedCount}</span>
            <span style={{ margin: '0 4px', opacity: 0.6 }}>/</span>
            <span>{totalCount} unlocked</span>
          </span>
        </div>
      )}
    </div>
  );
}

interface TrophyRowProps {
  achievement: UnlockedAchievement;
  isPhone: boolean;
  isLast: boolean;
}

function TrophyRow({ achievement, isPhone, isLast }: TrophyRowProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: isPhone ? '14px' : '16px',
        padding: isPhone ? '14px 0' : '16px 0',
        borderBottom: isLast ? 'none' : '1px solid rgba(170,168,200,0.08)',
      }}
    >
      {/* Medal tile */}
      <div
        style={{
          flexShrink: 0,
          width: isPhone ? 48 : 56,
          height: isPhone ? 48 : 56,
          borderRadius: 16,
          background:
            'linear-gradient(135deg, rgba(174,137,255,0.18) 0%, rgba(131,72,246,0.10) 100%)',
          border: '1px solid rgba(174,137,255,0.28)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#ae89ff',
          boxShadow: '0 8px 24px rgba(174,137,255,0.10)',
        }}
      >
        <span
          className="material-symbols-outlined"
          style={{
            fontSize: isPhone ? 26 : 30,
            fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24",
          }}
        >
          {achievement.icon}
        </span>
      </div>

      {/* Text column */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: isPhone ? '14px' : '15px',
            fontWeight: 700,
            color: '#e5e3ff',
            marginBottom: '3px',
            lineHeight: 1.25,
          }}
        >
          {achievement.name}
        </div>
        <div
          style={{
            fontSize: '12px',
            color: '#aaa8c8',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            marginBottom: '6px',
            lineHeight: 1.4,
          }}
          title={achievement.description}
        >
          {achievement.description}
        </div>
        <div
          style={{
            fontSize: '10px',
            fontWeight: 700,
            color: '#8888a8',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
          }}
        >
          Earned {formatEarnedDate(achievement.unlockedAt)}
        </div>
      </div>
    </div>
  );
}
