'use client';

import * as React from 'react';
import {
  COSMETICS,
  type Cosmetic,
  type CosmeticType,
  type NameColorCosmetic,
  type NameFontCosmetic,
  type TitleCosmetic,
  type FrameCosmetic,
  type BackgroundCosmetic,
} from '@/lib/cosmetics/catalog';
import { UserAvatar } from '@/components/user/UserAvatar';
import { ProfileBackground } from './ProfileBackground';

/**
 * `<CosmeticsShowcase>` — a compact gallery of everything a user has earned.
 *
 * Shown on public profile pages below the header. Read-only: clicking a tile
 * only flashes a level hint (nothing to select). We group by type and collapse
 * each group into a single horizontal strip so the profile page doesn't turn
 * into an endless scroller.
 *
 * The component does not fetch anything — the parent passes the pre-resolved
 * slug list from `/api/user/profile/[username]`.
 */
interface CosmeticsShowcaseProps {
  /** Slugs the user has earned, as returned by the public profile API. */
  unlockedIds: string[];
  /** Phone layout flag — reduces padding and tile sizes. */
  isPhone?: boolean;
}

// The display order of the type rails inside the showcase.
const TYPE_ORDER: { type: CosmeticType; label: string; icon: string }[] = [
  { type: 'title', label: 'Titles', icon: 'emoji_events' },
  { type: 'nameColor', label: 'Name Colors', icon: 'palette' },
  { type: 'nameFont', label: 'Fonts', icon: 'text_fields' },
  { type: 'frame', label: 'Avatar Frames', icon: 'crop_square' },
  { type: 'background', label: 'Backgrounds', icon: 'wallpaper' },
];

// Sorting: level asc, then label asc.
function byLevelThenLabel(a: Cosmetic, b: Cosmetic) {
  if (a.requiredLevel !== b.requiredLevel) return a.requiredLevel - b.requiredLevel;
  return a.label.localeCompare(b.label);
}

// ---------------------------------------------------------------------------
// Per-type tile bodies — minimal flavors of what CosmeticsPanel shows. Kept
// inline so the showcase can import only the catalog and not the heavier panel.
// ---------------------------------------------------------------------------
function TileBody({ entry }: { entry: Cosmetic }) {
  switch (entry.type) {
    case 'title':
      return <TitleTileBody entry={entry} />;
    case 'nameFont':
      return <FontTileBody entry={entry} />;
    case 'nameColor':
      return <ColorTileBody entry={entry} />;
    case 'frame':
      return <FrameTileBody entry={entry} />;
    case 'background':
      return <BackgroundTileBody entry={entry} />;
  }
}

function TitleTileBody({ entry }: { entry: TitleCosmetic }) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 8px',
      }}
    >
      <span
        style={{
          fontSize: 12,
          fontWeight: 800,
          color: '#e5e3ff',
          fontFamily: 'var(--font-brand)',
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          textAlign: 'center',
          lineHeight: 1.2,
        }}
      >
        {entry.label}
      </span>
    </div>
  );
}

function FontTileBody({ entry }: { entry: NameFontCosmetic }) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <span
        style={{
          fontSize: 26,
          fontWeight: 700,
          color: '#e5e3ff',
          fontFamily: entry.css,
          lineHeight: 1,
        }}
      >
        Aa
      </span>
    </div>
  );
}

function ColorTileBody({ entry }: { entry: NameColorCosmetic }) {
  const sample: React.CSSProperties = entry.gradient
    ? {
        backgroundImage: entry.css,
        backgroundClip: 'text',
        WebkitBackgroundClip: 'text',
        color: 'transparent',
        WebkitTextFillColor: 'transparent',
      }
    : { color: entry.css };
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <span
        style={{
          fontSize: 26,
          fontWeight: 900,
          fontFamily: 'var(--font-display)',
          lineHeight: 1,
          ...sample,
        }}
      >
        Aa
      </span>
    </div>
  );
}

function FrameTileBody({ entry }: { entry: FrameCosmetic }) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <UserAvatar
        user={{ equippedFrameId: entry.id, name: 'A', username: 'a' }}
        size={44}
        radius="50%"
      />
    </div>
  );
}

function BackgroundTileBody({ entry }: { entry: BackgroundCosmetic }) {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <ProfileBackground backgroundId={entry.id} radius={12} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tile — single unlock. Read-only. Hovering surfaces the label + level. The
// level pill flashes when clicked to give a bit of tactile feedback without
// actually doing anything (there's no edit affordance on a public profile).
// ---------------------------------------------------------------------------
function ShowcaseTile({ entry }: { entry: Cosmetic }) {
  const [pulse, setPulse] = React.useState(false);
  const isBackground = entry.type === 'background';
  const width = isBackground ? 132 : 92;
  const height = isBackground ? 80 : 92;

  return (
    <button
      type="button"
      onClick={() => {
        setPulse(true);
        window.setTimeout(() => setPulse(false), 500);
      }}
      title={`${entry.label} · Lvl ${entry.requiredLevel}`}
      style={{
        position: 'relative',
        width,
        minWidth: width,
        height,
        padding: 0,
        border: 'none',
        background: 'transparent',
        cursor: 'pointer',
        outline: 'none',
        fontFamily: 'inherit',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: 12,
          overflow: 'hidden',
          background: '#262646',
          border: '1px solid rgba(136,136,168,0.18)',
          boxShadow:
            '0 2px 8px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.03)',
          transform: pulse ? 'scale(1.04)' : 'scale(1)',
          transition:
            'transform 0.35s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.35s cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        <TileBody entry={entry} />
      </div>

      {/* Level pill — bottom right */}
      <div
        style={{
          position: 'absolute',
          right: 6,
          bottom: 6,
          padding: '2px 7px',
          borderRadius: 999,
          background: pulse ? '#ae89ff' : 'rgba(17,17,38,0.75)',
          color: pulse ? '#2a0066' : '#e5e3ff',
          fontSize: 9,
          fontWeight: 800,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          fontFamily: 'var(--font-brand)',
          backdropFilter: 'blur(4px)',
          transition:
            'background 0.25s cubic-bezier(0.22, 1, 0.36, 1), color 0.25s cubic-bezier(0.22, 1, 0.36, 1)',
          pointerEvents: 'none',
        }}
      >
        Lvl {entry.requiredLevel}
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// The showcase.
// ---------------------------------------------------------------------------
export function CosmeticsShowcase({
  unlockedIds,
  isPhone = false,
}: CosmeticsShowcaseProps) {
  // Resolve slugs to catalog entries, dropping any unknown ids and hiding
  // level-1 defaults (they're the baseline — everyone has them, showing them
  // makes the showcase look uniform and uninteresting). adminOnly entries
  // are the exception: they use `requiredLevel: 1` only as a sort sentinel
  // and are explicitly granted, so they should always appear in the showcase.
  const resolved = React.useMemo(() => {
    const entries: Cosmetic[] = [];
    const seen = new Set<string>();
    for (const id of unlockedIds) {
      if (seen.has(id)) continue;
      seen.add(id);
      const entry = COSMETICS[id];
      if (!entry) continue;
      if (entry.requiredLevel <= 1 && !entry.adminOnly) continue;
      entries.push(entry);
    }
    return entries;
  }, [unlockedIds]);

  // Group by type in display order.
  const grouped = React.useMemo(() => {
    return TYPE_ORDER.map(({ type, label, icon }) => ({
      type,
      label,
      icon,
      entries: resolved
        .filter((e) => e.type === type)
        .sort(byLevelThenLabel),
    })).filter((g) => g.entries.length > 0);
  }, [resolved]);

  if (grouped.length === 0) return null;

  const totalUnlocked = resolved.length;

  return (
    <div
      style={{
        position: 'relative',
        background: '#21213e',
        borderRadius: isPhone ? 20 : 24,
        padding: isPhone ? '24px 20px' : '32px',
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
        overflow: 'hidden',
      }}
    >
      {/* Faint primary bloom in the corner so the card doesn't read as flat */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(60% 50% at 100% 0%, rgba(174,137,255,0.10) 0%, transparent 60%)',
          pointerEvents: 'none',
        }}
      />

      <div
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            color: '#e5e3ff',
          }}
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: 22, color: '#ae89ff' }}
          >
            auto_awesome
          </span>
          <h3
            style={{
              fontSize: isPhone ? 15 : 17,
              fontWeight: 800,
              margin: 0,
              fontFamily: 'var(--font-display)',
              letterSpacing: '-0.01em',
            }}
          >
            Cosmetics Earned
          </h3>
        </div>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: '#8888a8',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          {totalUnlocked} unlock{totalUnlocked === 1 ? '' : 's'}
        </div>
      </div>

      <div
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
        }}
      >
        {grouped.map((group) => (
          <div key={group.type}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 10,
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: 16, color: '#8888a8' }}
              >
                {group.icon}
              </span>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#8888a8',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                }}
              >
                {group.label}
              </span>
              <span
                style={{
                  fontSize: 11,
                  color: '#555578',
                  fontWeight: 600,
                }}
              >
                · {group.entries.length}
              </span>
            </div>
            <div
              className="custom-scrollbar"
              style={{
                display: 'flex',
                gap: 10,
                overflowX: 'auto',
                paddingBottom: 4,
                scrollbarGutter: 'stable',
              }}
            >
              {group.entries.map((entry) => (
                <ShowcaseTile key={entry.id} entry={entry} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
