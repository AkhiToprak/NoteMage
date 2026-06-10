'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { ACHIEVEMENTS } from '@/lib/achievements';
import { Mascot } from '@/components/mascot';
import { formatAchievementDate } from '@/lib/achievement-format';
import { AchievementsError } from './AchievementsError';

// Lazy-load the full grid — most viewers never expand it, so this keeps
// the initial trophy-rail card lean.
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
  /**
   * When true the empty state renders the friendly Mascot. The public
   * profile view passes false so a visitor doesn't get the onboarding
   * mascot pose meant for the owner.
   */
  ownerView?: boolean;
}

const PREVIEW_COUNT = 4;

/**
 * Trophy rail on the profile pages. Collapsed view is a 4-up horizontal
 * tile row of the most recent unlocks — each tile carries the medal,
 * the achievement name, and the earned-date as small meta. Expand
 * inlines the full TrophyShelf (handles its own data fetch + tabs).
 *
 * The Hallmark rework moved the "trophy count" headline out to
 * ProfileAnchorStat so this card is now content-only — no eyebrow, no
 * footer-count, no UPPERCASE labels.
 */
export default function RecentTrophies({ userId, ownerView = true }: RecentTrophiesProps) {
  const { isPhone } = useBreakpoint();
  const [data, setData] = useState<AchievementsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/user/achievements?userId=${encodeURIComponent(userId)}`)
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((res) => {
        if (cancelled) return;
        setData(res?.data ?? res);
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

  const recent = (data?.unlocked ?? []).slice(0, PREVIEW_COUNT);
  const unlockedCount = data?.unlockedCount ?? data?.unlocked?.length ?? 0;
  const totalCount = data?.total ?? ACHIEVEMENTS.length;

  return (
    <section
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
      }}
    >
      {/* Heading row — sentence-case h2 + inline "all trophies" toggle.
          Pulls the count inline so the row carries the same info the old
          footer-count line used to, without the templated UPPERCASE. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: '12px',
          flexWrap: 'wrap',
        }}
      >
        <h2
          style={{
            margin: 0,
            fontFamily: 'var(--font-display)',
            fontSize: '20px',
            fontWeight: 700,
            letterSpacing: '-0.01em',
            color: 'var(--on-surface)',
          }}
        >
          Achievements{' '}
          {!loading && (
            <span
              className="tabular-nums"
              style={{
                fontSize: 'var(--fs-sm)',
                fontWeight: 500,
                color: 'var(--text-secondary)',
                marginLeft: '6px',
              }}
            >
              {unlockedCount} of {totalCount}
            </span>
          )}
        </h2>
        {!loading && recent.length > 0 && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="hl-trophy-toggle"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              background: 'transparent',
              border: 'none',
              color: 'var(--md-h4)',
              fontSize: 'var(--fs-sm)',
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
              padding: '4px 0',
              whiteSpace: 'nowrap',
            }}
          >
            {expanded ? 'Hide all' : 'All achievements'}
            <span
              className="material-symbols-outlined"
              aria-hidden
              style={{
                fontSize: '18px',
                transition: 'transform var(--dur-fast) var(--ease-spring)',
                transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
              }}
            >
              chevron_right
            </span>
            <style>{`
              .hl-trophy-toggle:hover { text-decoration: underline; text-underline-offset: 3px; }
              .hl-trophy-toggle:focus-visible {
                outline: 2px solid var(--color-focus);
                outline-offset: 4px;
                border-radius: 4px;
              }
              @media (prefers-reduced-motion: reduce) {
                .hl-trophy-toggle span { transition: none !important; }
              }
            `}</style>
          </button>
        )}
      </div>

      {/* Body */}
      {expanded ? (
        <TrophyShelf userId={userId} />
      ) : loading ? (
        <TrophyRailSkeleton isPhone={isPhone} />
      ) : error ? (
        <AchievementsError onRetry={retry} />
      ) : recent.length === 0 ? (
        <EmptyState ownerView={ownerView} />
      ) : (
        <TrophyRail items={recent} isPhone={isPhone} />
      )}
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Subcomponents
// ───────────────────────────────────────────────────────────────────────────

interface TrophyRailProps {
  items: UnlockedAchievement[];
  isPhone: boolean;
}

function TrophyRail({ items, isPhone }: TrophyRailProps) {
  return (
    <div
      style={{
        display: 'grid',
        // 4 tiles on desktop (matches PREVIEW_COUNT). On phone we let the
        // tiles wrap to 2 per row — keeps each tile readable rather than
        // shrinking to a thumbnail.
        gridTemplateColumns: isPhone ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))',
        gap: '12px',
      }}
    >
      {items.map((a) => (
        <TrophyTile key={a.badge} achievement={a} />
      ))}
    </div>
  );
}

function TrophyTile({ achievement }: { achievement: UnlockedAchievement }) {
  return (
    <article
      className="elev-1"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: '10px',
        padding: '16px',
        minHeight: '0',
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 'var(--radius-md)',
          background: 'var(--brand-purple-wash)',
          border: '1px solid var(--brand-purple-edge)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--md-h4)',
          flexShrink: 0,
        }}
      >
        <span
          className="material-symbols-outlined"
          aria-hidden
          style={{
            fontSize: 24,
            fontVariationSettings: "'FILL' 1, 'wght' 400",
          }}
        >
          {achievement.icon}
        </span>
      </div>
      <div style={{ minWidth: 0, width: '100%' }}>
        <div
          style={{
            fontSize: '13px',
            fontWeight: 700,
            color: 'var(--on-surface)',
            lineHeight: 1.3,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            marginBottom: '4px',
            overflowWrap: 'anywhere',
          }}
          title={achievement.name}
        >
          {achievement.name}
        </div>
        <div
          style={{
            fontSize: 'var(--fs-2xs)',
            color: 'var(--text-secondary)',
            fontWeight: 500,
          }}
        >
          {formatAchievementDate(achievement.unlockedAt)}
        </div>
      </div>
    </article>
  );
}

function TrophyRailSkeleton({ isPhone }: { isPhone: boolean }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: isPhone ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))',
        gap: '12px',
      }}
    >
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          aria-hidden
          className="hl-trophy-skeleton"
          style={{
            height: '116px',
            borderRadius: 'var(--radius-lg)',
            background: 'var(--brand-purple-wash)',
            border: '1px solid var(--rule-hairline)',
            animationDelay: `${i * 0.12}s`,
          }}
        />
      ))}
      <style>{`
        .hl-trophy-skeleton {
          animation: hl-trophy-pulse 1.5s var(--ease-spring) infinite;
        }
        @keyframes hl-trophy-pulse {
          0%, 100% { opacity: 0.55; }
          50% { opacity: 0.95; }
        }
        @media (prefers-reduced-motion: reduce) {
          .hl-trophy-skeleton { animation: none !important; opacity: 0.75; }
        }
      `}</style>
    </div>
  );
}

function EmptyState({ ownerView }: { ownerView: boolean }) {
  return (
    <div
      className="elev-1"
      style={{
        padding: '24px',
        textAlign: 'center',
        color: 'var(--on-surface-variant)',
        fontSize: 'var(--fs-sm)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '10px',
      }}
    >
      {ownerView && <Mascot pose="sleeping" size="md" idle="sway" />}
      {ownerView ? 'No achievements yet. Keep studying!' : 'No achievements unlocked yet.'}
    </div>
  );
}
