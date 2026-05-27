'use client';

import * as React from 'react';
import { useEffect, useState } from 'react';
import { ACHIEVEMENTS } from '@/lib/achievements';
import { useBreakpoint } from '@/hooks/useBreakpoint';

/**
 * The page's typographic peak. Replaces the friend-count 52px display
 * that used to be orphaned inside SocialsCard. This component pulls the
 * trophy unlock count from the same /api/user/achievements endpoint
 * RecentTrophies already calls — so a viewer waiting for the trophy rail
 * sees the anchor light up at the same moment as the rail below.
 *
 * Off-axis right on desktop (deliberate break from the page's
 * left-column rhythm — the page now has TWO anchors: the avatar at the
 * top-left, and the number at the right). Left-aligned on phone where
 * column width can't sustain the right-flush.
 */
interface ProfileAnchorStatProps {
  /** Drives the request. Pass the public-profile id; omit on self-view. */
  userId: string;
  /**
   * When the viewer's `hideAchievements` is set the parent shouldn't
   * render this at all — the trophy data isn't returned. The component
   * has no internal hide-mode; control it from the caller.
   */
}

interface AchievementsCountResponse {
  unlockedCount?: number;
  total?: number;
  unlocked?: unknown[];
}

export function ProfileAnchorStat({ userId }: ProfileAnchorStatProps) {
  const { isPhone } = useBreakpoint();
  const [unlocked, setUnlocked] = useState<number | null>(null);
  const [total, setTotal] = useState<number>(ACHIEVEMENTS.length);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/user/achievements?userId=${encodeURIComponent(userId)}`)
      .then((r) => r.json())
      .then((res) => {
        if (cancelled) return;
        const d = (res?.data ?? res) as AchievementsCountResponse;
        const count = d.unlockedCount ?? d.unlocked?.length ?? 0;
        const totalCount = d.total ?? ACHIEVEMENTS.length;
        setUnlocked(count);
        setTotal(totalCount);
      })
      .catch(() => {
        if (cancelled) return;
        // Failure is non-fatal: the anchor renders as a dash so the rest
        // of the page (avatar, heatmap, trophy rail's own loading state)
        // still composes correctly.
        setUnlocked(0);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return (
    <div
      style={{
        display: 'flex',
        // Off-axis right on desktop, left-aligned on phone. The
        // alignment break is one of the page's two structural surprises
        // (the other is the trophy tile rail breaking out of the card
        // rhythm).
        justifyContent: isPhone ? 'flex-start' : 'flex-end',
        padding: isPhone ? '8px 0 4px' : '12px 0 4px',
      }}
    >
      <div
        style={{
          textAlign: isPhone ? 'left' : 'right',
          minWidth: 0,
        }}
      >
        <div
          aria-live="polite"
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: isPhone ? '56px' : '88px',
            fontWeight: 800,
            fontStyle: 'italic',
            letterSpacing: '-0.035em',
            lineHeight: 0.95,
            color: 'var(--on-surface)',
            fontVariantNumeric: 'tabular-nums',
            // When loading, show an em-dash placeholder at the same size
            // so the layout doesn't jump when the number lands.
          }}
        >
          {loading || unlocked == null ? '—' : unlocked}
        </div>
        <div
          style={{
            marginTop: '6px',
            fontSize: '13px',
            color: 'var(--on-surface-variant)',
            fontWeight: 500,
          }}
        >
          {loading || unlocked == null ? (
            <>trophies unlocked</>
          ) : (
            <>
              {unlocked === 1 ? 'trophy' : 'trophies'} unlocked
              <span aria-hidden style={{ opacity: 0.5, margin: '0 6px' }}>·</span>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>{total}</span> total
            </>
          )}
        </div>
      </div>
    </div>
  );
}
