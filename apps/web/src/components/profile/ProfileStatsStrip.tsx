'use client';

import * as React from 'react';
import { useEffect, useState } from 'react';
import { ACHIEVEMENTS } from '@/lib/achievements';
import { useBreakpoint } from '@/hooks/useBreakpoint';

/**
 * Horizontal 3-cell stats strip under the hero. Replaces the v1
 * orphan-anchor design (single 88px italic number floating off-axis
 * right of the page) with three equal-weight stats that fill the column
 * and carry real signal: trophies unlocked, study minutes this month,
 * friends count.
 *
 * Single unified card surface with internal hairlines so the row reads
 * as ONE stats bar, not three floating tiles. Phone keeps 3 cells but
 * shrinks the numeric size so it still fits at 320 px.
 */
interface ProfileStatsStripProps {
  /** Drives both the trophies fetch and the heatmap fetch. */
  userId: string;
  /** Parent already has this from the profile payload or /api/friends. */
  friendsCount: number;
  /**
   * When the owner has hidden achievements from non-friends, the parent
   * should pass `hideTrophies` so the trophies cell is suppressed.
   * Defaults to false (most viewers see trophies).
   */
  hideTrophies?: boolean;
}

interface AchievementsCountResponse {
  unlockedCount?: number;
  total?: number;
  unlocked?: unknown[];
}

interface HeatmapDay {
  date: string;
  count: number;
}

interface HeatmapResponse {
  data?: HeatmapDay[] | { data?: HeatmapDay[] };
}

export function ProfileStatsStrip({
  userId,
  friendsCount,
  hideTrophies = false,
}: ProfileStatsStripProps) {
  const { isPhone } = useBreakpoint();
  const [trophies, setTrophies] = useState<{ unlocked: number; total: number } | null>(null);
  const [minutes30d, setMinutes30d] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Trophies — skip the fetch when hidden so we don't waste a request
    // for a cell that won't render.
    if (!hideTrophies) {
      fetch(`/api/user/achievements?userId=${encodeURIComponent(userId)}`)
        .then((r) => r.json())
        .then((res) => {
          if (cancelled) return;
          const d = (res?.data ?? res) as AchievementsCountResponse;
          setTrophies({
            unlocked: d.unlockedCount ?? d.unlocked?.length ?? 0,
            total: d.total ?? ACHIEVEMENTS.length,
          });
        })
        .catch(() => {
          if (cancelled) return;
          setTrophies({ unlocked: 0, total: ACHIEVEMENTS.length });
        });
    }

    // Minutes — sum the last 30 days from the heatmap endpoint. The
    // heatmap below already calls the same endpoint with a longer
    // window; the duplicate request is the price of a focused stats
    // strip that doesn't need the heatmap component to lift its state.
    fetch(`/api/user/activity-heatmap?days=30&userId=${encodeURIComponent(userId)}`)
      .then((r) => r.json())
      .then((res) => {
        if (cancelled) return;
        const payload = (res?.data ?? res) as HeatmapResponse;
        // The endpoint nests under .data.data sometimes (per the
        // ActivityHeatmap shim) — accept both shapes.
        const days: HeatmapDay[] = Array.isArray(payload)
          ? (payload as unknown as HeatmapDay[])
          : Array.isArray((payload as { data?: HeatmapDay[] }).data)
            ? ((payload as { data?: HeatmapDay[] }).data as HeatmapDay[])
            : [];
        const total = days.reduce((acc, d) => acc + (d.count ?? 0), 0);
        setMinutes30d(total);
      })
      .catch(() => {
        if (cancelled) return;
        setMinutes30d(0);
      });

    return () => {
      cancelled = true;
    };
  }, [userId, hideTrophies]);

  const cells: { key: string; value: React.ReactNode; label: string }[] = [];

  if (!hideTrophies) {
    cells.push({
      key: 'trophies',
      value: trophies ? trophies.unlocked : '—',
      label: trophies ? `of ${trophies.total} trophies` : 'trophies',
    });
  }
  cells.push({
    key: 'minutes',
    value: minutes30d != null ? minutes30d : '—',
    label: 'minutes this month',
  });
  cells.push({
    key: 'friends',
    value: friendsCount,
    label: friendsCount === 1 ? 'friend' : 'friends',
  });

  return (
    <div
      role="list"
      aria-label="Profile statistics"
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))`,
        background: 'var(--surface-container-low)',
        borderRadius: 'var(--radius-xl)',
        overflow: 'hidden',
      }}
    >
      {cells.map((c, i) => (
        <div
          key={c.key}
          role="listitem"
          style={{
            padding: isPhone ? '18px 12px' : '22px 24px',
            borderLeft: i === 0 ? 'none' : '1px solid var(--rule-hairline)',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            minWidth: 0,
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: isPhone ? '28px' : '36px',
              fontWeight: 800,
              letterSpacing: '-0.02em',
              lineHeight: 1,
              color: 'var(--on-surface)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {c.value}
          </div>
          <div
            style={{
              fontSize: isPhone ? '11px' : '12px',
              color: 'var(--on-surface-variant)',
              fontWeight: 500,
              lineHeight: 1.3,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {c.label}
          </div>
        </div>
      ))}
    </div>
  );
}
