'use client';

import * as React from 'react';
import {
  COSMETICS,
  getCosmeticsByType,
  type Cosmetic,
  type NameColorCosmetic,
  type NameFontCosmetic,
  type TitleCosmetic,
  type FrameCosmetic,
  type BackgroundCosmetic,
} from '@/lib/cosmetics/catalog';
import { UserName } from '@/components/user/UserName';
import { UserAvatar } from '@/components/user/UserAvatar';
import { ProfileBackground } from './ProfileBackground';
import { useDirectUpload } from '@/hooks/useDirectUpload';

/**
 * `<CosmeticsPanel>` — the customization studio inside the profile edit form.
 *
 * Self-contained: fetches the user's level + owned cosmetic ids on mount, then
 * renders five scrollable picker rails (Title / Name Font / Name Color / Avatar
 * Frame / Profile Background) above a live preview of the user's card. All
 * selection state is lifted to the parent via `value` / `onChange` so the
 * parent save flow can POST it back through the existing profile PUT.
 *
 * Locked entries show a level pill. Clicking them briefly highlights the pill
 * instead of changing selection. `font.default` / `color.default` / `frame.default`
 * / `bg.default` are treated as "clear" — selecting them stores `null` on the
 * corresponding equipped* field.
 */

export interface CosmeticsSelection {
  equippedTitleId: string | null;
  fontId: string | null;
  colorId: string | null;
  equippedFrameId: string | null;
  equippedBackgroundId: string | null;
  /**
   * Admin-only override: URL of a GIF/image uploaded by an admin to replace
   * their catalog background entirely. `null` for every non-admin, and for
   * admins who haven't uploaded one yet. Overrides `equippedBackgroundId`
   * everywhere <ProfileBackground> is rendered.
   */
  customBackgroundUrl: string | null;
}

interface CosmeticsPanelProps {
  /** Currently-selected cosmetics. */
  value: CosmeticsSelection;
  onChange: (next: CosmeticsSelection) => void;
  /** User shape for the preview card (name + username + avatarUrl). */
  previewUser: {
    name?: string | null;
    username?: string | null;
    avatarUrl?: string | null;
  };
  /** Compact layout for phones — reduces preview padding. */
  compact?: boolean;
  /**
   * When true, the admin-only "Upload custom background" section renders.
   * Purely additive — set to `false` (or omit) for normal users and they
   * see the exact same panel they always have.
   */
  isAdmin?: boolean;
}

interface CosmeticsData {
  level: number;
  owned: Set<string>;
  /** Map of slug -> ms-since-epoch unlock timestamp. */
  unlockedAt: Record<string, number>;
}

/**
 * How long after unlock an entry shows the "NEW" badge. Chosen long enough
 * that a user who unlocked something an hour ago still sees the ribbon the
 * next time they open the customization studio, but short enough that
 * veteran unlocks don't permanently clutter the rails.
 */
const NEW_BADGE_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h

// ---------------------------------------------------------------------------
// Internal styling tokens — local to this panel. Kept tight so the picker
// rails stay visually consistent with each other.
// ---------------------------------------------------------------------------
const EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';
const RAIL_GAP = 10;
const SWATCH_RADIUS = 14;

const LABEL_STYLE: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: '#8888a8',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  marginBottom: 10,
};

// ---------------------------------------------------------------------------
// Hook: fetch /api/user/cosmetics once. Returns loading/data/error.
// ---------------------------------------------------------------------------
function useCosmetics() {
  const [data, setData] = React.useState<CosmeticsData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    fetch('/api/user/cosmetics')
      .then((r) => r.json())
      .then((res) => {
        if (cancelled) return;
        const d = res?.data ?? res;
        if (typeof d?.level === 'number' && Array.isArray(d?.owned)) {
          const unlockedAt: Record<string, number> = {};
          const raw = (d?.unlockedAt ?? {}) as Record<string, string>;
          for (const [slug, iso] of Object.entries(raw)) {
            const t = Date.parse(iso);
            if (!Number.isNaN(t)) unlockedAt[slug] = t;
          }
          setData({
            level: d.level,
            owned: new Set<string>(d.owned),
            unlockedAt,
          });
        } else {
          setError('Could not load cosmetics');
        }
      })
      .catch(() => {
        if (!cancelled) setError('Could not load cosmetics');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { data, loading, error };
}

// ---------------------------------------------------------------------------
// Reusable swatch shell. Handles owned/locked/selected visual states, keyboard
// focus, and the "locked: shake + flash level pill" click affordance.
// ---------------------------------------------------------------------------
interface SwatchShellProps {
  label: string;
  requiredLevel: number;
  owned: boolean;
  selected: boolean;
  onSelect: () => void;
  children: React.ReactNode;
  width?: number;
  height?: number;
  /** Show a NEW ribbon — badge takes precedence over the selected check. */
  isNew?: boolean;
}

function SwatchShell({
  label,
  requiredLevel,
  owned,
  selected,
  onSelect,
  children,
  width = 112,
  height = 92,
  isNew = false,
}: SwatchShellProps) {
  const [lockHint, setLockHint] = React.useState(false);
  const locked = !owned;

  const handleClick = () => {
    if (locked) {
      setLockHint(true);
      window.setTimeout(() => setLockHint(false), 600);
      return;
    }
    onSelect();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-pressed={selected}
      aria-disabled={locked}
      title={locked ? `Unlocks at level ${requiredLevel}` : label}
      className="cosmetic-swatch-btn"
      style={{
        position: 'relative',
        width,
        minWidth: width,
        height,
        padding: 0,
        border: 'none',
        borderRadius: SWATCH_RADIUS,
        background: 'transparent',
        cursor: locked ? 'not-allowed' : 'pointer',
        outline: 'none',
        fontFamily: 'inherit',
        flexShrink: 0,
        transform: lockHint ? 'translateX(0)' : undefined,
        animation: lockHint ? 'cosmetic-shake 0.45s ease-in-out' : undefined,
      }}
    >
      {/* Visual surface */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: SWATCH_RADIUS,
          overflow: 'hidden',
          background: '#2a2a4c',
          border: selected
            ? '2px solid #ae89ff'
            : '1px solid rgba(136,136,168,0.18)',
          boxShadow: selected
            ? '0 0 0 3px rgba(174,137,255,0.18), 0 8px 24px rgba(174,137,255,0.22)'
            : '0 2px 8px rgba(0,0,0,0.25)',
          transition: `border-color 0.22s ${EASING}, box-shadow 0.22s ${EASING}, transform 0.22s ${EASING}`,
          transform: selected ? 'translateY(-1px)' : 'translateY(0)',
          opacity: locked ? 0.55 : 1,
          filter: locked ? 'saturate(0.55)' : 'none',
        }}
      >
        {children}
      </div>

      {/* Lock overlay */}
      {locked && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: SWATCH_RADIUS,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
            background: 'rgba(17,17,38,0.35)',
            backdropFilter: 'blur(1px)',
            pointerEvents: 'none',
          }}
        >
          <span
            className="material-symbols-outlined"
            style={{
              fontSize: 18,
              color: '#e5e3ff',
              opacity: 0.85,
              textShadow: '0 2px 8px rgba(0,0,0,0.45)',
            }}
          >
            lock
          </span>
          <span
            style={{
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              padding: '2px 8px',
              borderRadius: 999,
              background: lockHint ? '#ae89ff' : 'rgba(255,255,255,0.12)',
              color: lockHint ? '#2a0066' : '#e5e3ff',
              transition: `background 0.25s ${EASING}, color 0.25s ${EASING}`,
            }}
          >
            Lvl {requiredLevel}
          </span>
        </div>
      )}

      {/* NEW ribbon — takes precedence over the select check so freshly
          unlocked entries scream for attention. */}
      {isNew && !locked && (
        <div
          style={{
            position: 'absolute',
            top: -6,
            right: -6,
            padding: '3px 8px',
            borderRadius: 999,
            background:
              'linear-gradient(90deg, #ffde59 0%, #ff9566 70%, #ff5fa2 100%)',
            color: '#2a0066',
            fontSize: 9,
            fontWeight: 900,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            fontFamily: 'var(--font-brand)',
            boxShadow:
              '0 4px 14px rgba(255,149,102,0.45), 0 0 0 2px rgba(17,17,38,0.85)',
            pointerEvents: 'none',
            zIndex: 2,
          }}
        >
          New
        </div>
      )}

      {/* Check badge on selected */}
      {selected && !locked && !isNew && (
        <div
          style={{
            position: 'absolute',
            top: 6,
            right: 6,
            width: 18,
            height: 18,
            borderRadius: '50%',
            background: '#ae89ff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(174,137,255,0.5)',
          }}
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: 13, color: '#2a0066', fontWeight: 900 }}
          >
            check
          </span>
        </div>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Picker rail. Horizontal scroller with a title + optional description.
//
// Keyboard navigation:
//   ArrowLeft / ArrowRight  — move focus to prev/next swatch button (wrap-around)
//   Home                    — focus first swatch
//   End                     — focus last swatch
//   Enter / Space           — handled natively by the button itself
//
// Implemented at the Rail level with a roving focus walker so SwatchShell
// stays generic. We query all direct button descendants on keydown so it
// naturally picks up the "No title" swatch and any future rail additions
// without extra wiring.
// ---------------------------------------------------------------------------
function Rail({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  const scrollerRef = React.useRef<HTMLDivElement>(null);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    // Only handle our navigation keys — let everything else (Tab, typing
    // into nested inputs that might appear later, etc.) pass through.
    const { key } = event;
    if (
      key !== 'ArrowLeft' &&
      key !== 'ArrowRight' &&
      key !== 'Home' &&
      key !== 'End'
    ) {
      return;
    }
    const buttons = Array.from(
      scroller.querySelectorAll<HTMLButtonElement>('button')
    );
    if (buttons.length === 0) return;

    const active = document.activeElement as HTMLElement | null;
    const currentIdx = active ? buttons.indexOf(active as HTMLButtonElement) : -1;

    let nextIdx: number;
    if (key === 'Home') {
      nextIdx = 0;
    } else if (key === 'End') {
      nextIdx = buttons.length - 1;
    } else if (key === 'ArrowRight') {
      nextIdx = currentIdx < 0 ? 0 : (currentIdx + 1) % buttons.length;
    } else {
      // ArrowLeft
      nextIdx =
        currentIdx < 0
          ? buttons.length - 1
          : (currentIdx - 1 + buttons.length) % buttons.length;
    }

    event.preventDefault();
    const target = buttons[nextIdx];
    target.focus({ preventScroll: true });
    // Keep the focused swatch in view in the horizontal scroller.
    target.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
  };

  return (
    <div role="group" aria-label={label}>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          marginBottom: 10,
        }}
      >
        <div style={LABEL_STYLE}>{label}</div>
        {hint && (
          <div
            style={{
              fontSize: 11,
              color: '#6a6a8c',
              fontStyle: 'italic',
            }}
          >
            {hint}
          </div>
        )}
      </div>
      <div
        ref={scrollerRef}
        onKeyDown={handleKeyDown}
        className="custom-scrollbar"
        style={{
          display: 'flex',
          gap: RAIL_GAP,
          overflowX: 'auto',
          paddingBottom: 6,
          scrollbarGutter: 'stable',
        }}
      >
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Type-specific swatch interiors.
// ---------------------------------------------------------------------------
function TitleSwatchBody({ entry }: { entry: TitleCosmetic }) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 8px',
        textAlign: 'center',
      }}
    >
      <span
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: '#e5e3ff',
          fontFamily: 'var(--font-brand)',
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          lineHeight: 1.2,
        }}
      >
        {entry.label}
      </span>
    </div>
  );
}

function FontSwatchBody({ entry }: { entry: NameFontCosmetic }) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
      }}
    >
      <span
        style={{
          fontSize: 22,
          fontWeight: 700,
          color: '#e5e3ff',
          fontFamily: entry.css,
          lineHeight: 1,
        }}
      >
        Aa
      </span>
      <span
        style={{
          fontSize: 10,
          color: '#8888a8',
          fontWeight: 600,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
        }}
      >
        {entry.label}
      </span>
    </div>
  );
}

function ColorSwatchBody({ entry }: { entry: NameColorCosmetic }) {
  // Paint an "Aa" using the equipped color (gradient or solid).
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
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
      }}
    >
      <span
        style={{
          fontSize: 22,
          fontWeight: 800,
          lineHeight: 1,
          fontFamily: 'var(--font-display)',
          ...sample,
        }}
      >
        Aa
      </span>
      <span
        style={{
          fontSize: 10,
          color: '#8888a8',
          fontWeight: 600,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
        }}
      >
        {entry.label}
      </span>
    </div>
  );
}

function FrameSwatchBody({ entry }: { entry: FrameCosmetic }) {
  // Reuse <UserAvatar> with the frame equipped so the preview is pixel-accurate.
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
      }}
    >
      <UserAvatar
        user={{ equippedFrameId: entry.id, name: 'S', username: 's' }}
        size={38}
        radius="50%"
      />
      <span
        style={{
          fontSize: 10,
          color: '#8888a8',
          fontWeight: 600,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
        }}
      >
        {entry.label}
      </span>
    </div>
  );
}

function BackgroundSwatchBody({ entry }: { entry: BackgroundCosmetic }) {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <ProfileBackground backgroundId={entry.id} radius={SWATCH_RADIUS} />
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          padding: '6px 8px 8px',
          display: 'flex',
          justifyContent: 'center',
          background:
            'linear-gradient(180deg, transparent 0%, rgba(17,17,38,0.7) 100%)',
        }}
      >
        <span
          style={{
            fontSize: 10,
            color: '#e5e3ff',
            fontWeight: 700,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
          }}
        >
          {entry.label}
        </span>
      </div>
    </div>
  );
}

// Compare for sorting: level asc, then label asc.
function byLevelThenLabel(a: Cosmetic, b: Cosmetic) {
  if (a.requiredLevel !== b.requiredLevel) return a.requiredLevel - b.requiredLevel;
  return a.label.localeCompare(b.label);
}

// ---------------------------------------------------------------------------
// The panel.
// ---------------------------------------------------------------------------
export function CosmeticsPanel({
  value,
  onChange,
  previewUser,
  compact = false,
  isAdmin = false,
}: CosmeticsPanelProps) {
  const { data, loading, error } = useCosmetics();

  // Catalog subsets, sorted by level asc.
  const titles = React.useMemo(
    () => getCosmeticsByType('title').sort(byLevelThenLabel),
    []
  );
  const fonts = React.useMemo(
    () => getCosmeticsByType('nameFont').sort(byLevelThenLabel),
    []
  );
  const colors = React.useMemo(
    () => getCosmeticsByType('nameColor').sort(byLevelThenLabel),
    []
  );
  const frames = React.useMemo(
    () => getCosmeticsByType('frame').sort(byLevelThenLabel),
    []
  );
  const backgrounds = React.useMemo(
    () => getCosmeticsByType('background').sort(byLevelThenLabel),
    []
  );

  // Helpers to check owned/selected state.
  const isOwned = React.useCallback(
    (id: string) => {
      if (!data) return false;
      // Level-1 defaults are always owned even if the UserCosmetic row hasn't
      // been written yet — this mirrors the profile PUT validator.
      const entry = COSMETICS[id];
      if (entry && entry.requiredLevel <= 1) return true;
      return data.owned.has(id);
    },
    [data]
  );

  // Freshly unlocked entries get a NEW ribbon for NEW_BADGE_WINDOW_MS after
  // the UserCosmetic row was written. We snapshot "now" on mount via a lazy
  // useState initializer (pure in render — called exactly once) so the
  // badge doesn't flicker off while the panel is open.
  const [mountedAt] = React.useState<number>(() => Date.now());
  const isNewlyUnlocked = React.useCallback(
    (id: string) => {
      if (!data) return false;
      const t = data.unlockedAt[id];
      if (!t) return false;
      return mountedAt - t < NEW_BADGE_WINDOW_MS;
    },
    [data, mountedAt]
  );

  // "Default" selection means the equipped field is null. We represent this
  // in the rail by treating `xxx.default` as the selected id when the
  // corresponding field on `value` is null.
  const titleSelection = value.equippedTitleId ?? null;
  const fontSelection = value.fontId ?? 'font.default';
  const colorSelection = value.colorId ?? 'color.default';
  const frameSelection = value.equippedFrameId ?? 'frame.default';
  const backgroundSelection = value.equippedBackgroundId ?? 'bg.default';

  // Preview user — carries the in-flight selection so the card reflects
  // edits immediately, before the user saves.
  const livePreviewUser = {
    ...previewUser,
    nameStyle: {
      fontId: value.fontId ?? undefined,
      colorId: value.colorId ?? undefined,
    },
    equippedTitleId: value.equippedTitleId,
    equippedFrameId: value.equippedFrameId,
  };

  // ── Admin-only GIF background uploader ───────────────────────────────
  // Hoisted up here so the hook order stays stable regardless of the
  // `isAdmin` prop. The upload itself targets the `admin-background`
  // purpose, which re-checks the caller's role server-side.
  const { upload: uploadAdminBg, isUploading: adminBgUploading, error: adminBgError } =
    useDirectUpload();
  const [adminBgFeedback, setAdminBgFeedback] = React.useState<string | null>(null);
  const adminFileInputRef = React.useRef<HTMLInputElement>(null);

  const handleAdminBgPick = () => {
    adminFileInputRef.current?.click();
  };

  const handleAdminBgFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset the <input> so picking the same file twice still fires onChange.
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setAdminBgFeedback('Pick an image file (GIF, PNG, JPG, WebP).');
      return;
    }
    // Generous cap — GIFs are often a few MB. 20 MB covers every sane case
    // without letting someone accidentally ship a 200 MB file.
    if (file.size > 20 * 1024 * 1024) {
      setAdminBgFeedback('Max file size is 20 MB.');
      return;
    }
    setAdminBgFeedback(null);
    try {
      const { publicUrl } = await uploadAdminBg(file, 'admin-background');
      if (!publicUrl) {
        setAdminBgFeedback('Upload succeeded but no public URL came back.');
        return;
      }
      // Cache-bust so the preview immediately reflects the new upload even
      // when Supabase's CDN would otherwise serve the previous object at
      // the same path.
      const bust = `${publicUrl}${publicUrl.includes('?') ? '&' : '?'}t=${Date.now()}`;
      onChange({ ...value, customBackgroundUrl: bust });
      setAdminBgFeedback('Uploaded — remember to hit Save.');
    } catch {
      setAdminBgFeedback('Upload failed. Try again.');
    }
  };

  const clearAdminBg = () => {
    onChange({ ...value, customBackgroundUrl: null });
    setAdminBgFeedback('Custom background cleared — hit Save.');
  };

  // Rail handlers. Default entries clear the corresponding field.
  const selectTitle = (id: string) => {
    onChange({
      ...value,
      equippedTitleId: id === titleSelection ? null : id,
    });
  };
  const selectFont = (id: string) => {
    onChange({ ...value, fontId: id === 'font.default' ? null : id });
  };
  const selectColor = (id: string) => {
    onChange({ ...value, colorId: id === 'color.default' ? null : id });
  };
  const selectFrame = (id: string) => {
    onChange({
      ...value,
      equippedFrameId: id === 'frame.default' ? null : id,
    });
  };
  const selectBackground = (id: string) => {
    onChange({
      ...value,
      equippedBackgroundId: id === 'bg.default' ? null : id,
    });
  };

  // Loading / error — keep the block height stable.
  if (loading) {
    return (
      <div
        style={{
          minHeight: 220,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#8888a8',
          fontSize: 13,
        }}
      >
        <span
          className="material-symbols-outlined"
          style={{
            fontSize: 32,
            color: '#ae89ff',
            animation: 'spin 1s linear infinite',
          }}
        >
          progress_activity
        </span>
      </div>
    );
  }
  if (error || !data) {
    return (
      <div
        style={{
          padding: '16px 20px',
          borderRadius: 12,
          background: 'rgba(253,111,133,0.08)',
          border: '1px solid rgba(253,111,133,0.25)',
          color: '#fd6f85',
          fontSize: 13,
        }}
      >
        Could not load your cosmetics. Try reopening this page.
      </div>
    );
  }

  const previewPad = compact ? 20 : 28;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* keyframes + focus ring injected once, local to the panel */}
      <style jsx global>{`
        @keyframes cosmetic-shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-4px); }
          40% { transform: translateX(4px); }
          60% { transform: translateX(-3px); }
          80% { transform: translateX(3px); }
        }
        .cosmetic-swatch-btn:focus-visible {
          box-shadow:
            0 0 0 2px #1c1c38,
            0 0 0 4px #ae89ff,
            0 10px 32px rgba(174,137,255,0.28);
        }
      `}</style>

      {/* ── Live preview card ── */}
      <div
        style={{
          position: 'relative',
          borderRadius: 20,
          overflow: 'hidden',
          border: '1px solid rgba(174,137,255,0.22)',
          background: '#1c1c38',
          padding: previewPad,
          minHeight: 140,
          display: 'flex',
          alignItems: 'center',
          gap: previewPad - 6,
        }}
      >
        <ProfileBackground
          backgroundId={value.equippedBackgroundId}
          customBackgroundUrl={value.customBackgroundUrl}
          radius={20}
        />

        <div style={{ position: 'relative', zIndex: 1 }}>
          <UserAvatar
            user={{
              name: previewUser.name,
              username: previewUser.username,
              avatarUrl: previewUser.avatarUrl,
              equippedFrameId: value.equippedFrameId,
            }}
            size={compact ? 72 : 84}
            radius="50%"
          />
        </div>

        <div
          style={{
            position: 'relative',
            zIndex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            minWidth: 0,
          }}
        >
          <UserName
            user={livePreviewUser}
            showTitle
            as="div"
            style={{
              // Intentionally no `fontFamily` — UserName applies the cosmetic
              // font on its outer element, and any hardcoded fontFamily here
              // would override what the user just picked in the rail.
              fontSize: compact ? 20 : 24,
              fontWeight: 800,
              color: '#e5e3ff',
              lineHeight: 1.1,
            }}
          />
          <p
            style={{
              margin: 0,
              fontSize: 13,
              color: '#aaa8c8',
              letterSpacing: '0.02em',
            }}
          >
            @{previewUser.username ?? 'you'}
          </p>
          <p
            style={{
              margin: '4px 0 0',
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: '#6a6a8c',
            }}
          >
            Live preview · Level {data.level}
          </p>
        </div>
      </div>

      {/* ── Admin-only custom background uploader ── */}
      {isAdmin && (
        <div
          style={{
            position: 'relative',
            borderRadius: 16,
            border: '1px solid rgba(255,222,89,0.35)',
            background:
              'linear-gradient(135deg, rgba(255,222,89,0.08) 0%, rgba(174,137,255,0.06) 100%)',
            padding: 20,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              className="material-symbols-outlined"
              style={{ color: '#ffde59', fontSize: 22 }}
            >
              admin_panel_settings
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 800,
                  color: '#ffde59',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                }}
              >
                Admin · Custom Background
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: '#aaa8c8',
                  marginTop: 2,
                }}
              >
                Upload a GIF (or any image) and it overrides the catalog
                background on your profile. Only you see this control.
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={handleAdminBgPick}
              disabled={adminBgUploading}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '10px 16px',
                borderRadius: 10,
                border: 'none',
                background: 'rgba(255,222,89,0.15)',
                color: '#ffde59',
                fontSize: 13,
                fontWeight: 700,
                cursor: adminBgUploading ? 'wait' : 'pointer',
                fontFamily: 'inherit',
                opacity: adminBgUploading ? 0.65 : 1,
                transition: `background 0.2s ${EASING}`,
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: 16 }}
              >
                {adminBgUploading ? 'progress_activity' : 'upload'}
              </span>
              {adminBgUploading ? 'Uploading…' : 'Upload GIF / image'}
            </button>
            {value.customBackgroundUrl && (
              <button
                type="button"
                onClick={clearAdminBg}
                disabled={adminBgUploading}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '10px 16px',
                  borderRadius: 10,
                  border: '1px solid rgba(253,111,133,0.35)',
                  background: 'rgba(253,111,133,0.08)',
                  color: '#fd6f85',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 16 }}
                >
                  close
                </span>
                Clear custom
              </button>
            )}
          </div>

          <input
            ref={adminFileInputRef}
            type="file"
            accept="image/*"
            onChange={handleAdminBgFile}
            style={{ display: 'none' }}
          />

          {(adminBgFeedback || adminBgError) && (
            <div
              style={{
                fontSize: 12,
                color: adminBgError ? '#fd6f85' : '#aaa8c8',
                fontStyle: 'italic',
              }}
            >
              {adminBgError || adminBgFeedback}
            </div>
          )}
        </div>
      )}

      {/* ── Rails ── */}
      <Rail label="Title" hint="Shown next to your name">
        {/* Explicit "no title" option */}
        <SwatchShell
          label="No title"
          requiredLevel={1}
          owned
          selected={titleSelection === null}
          onSelect={() => onChange({ ...value, equippedTitleId: null })}
        >
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
              className="material-symbols-outlined"
              style={{ color: '#6a6a8c', fontSize: 26 }}
            >
              block
            </span>
          </div>
        </SwatchShell>
        {titles.map((t) => (
          <SwatchShell
            key={t.id}
            label={t.label}
            requiredLevel={t.requiredLevel}
            owned={isOwned(t.id)}
            selected={titleSelection === t.id}
            onSelect={() => selectTitle(t.id)}
            isNew={isNewlyUnlocked(t.id)}
          >
            <TitleSwatchBody entry={t} />
          </SwatchShell>
        ))}
      </Rail>

      <Rail label="Name Font" hint="Applied everywhere your name appears">
        {fonts.map((f) => (
          <SwatchShell
            key={f.id}
            label={f.label}
            requiredLevel={f.requiredLevel}
            owned={isOwned(f.id)}
            selected={fontSelection === f.id}
            onSelect={() => selectFont(f.id)}
            width={96}
            isNew={isNewlyUnlocked(f.id)}
          >
            <FontSwatchBody entry={f} />
          </SwatchShell>
        ))}
      </Rail>

      <Rail label="Name Color">
        {colors.map((c) => (
          <SwatchShell
            key={c.id}
            label={c.label}
            requiredLevel={c.requiredLevel}
            owned={isOwned(c.id)}
            selected={colorSelection === c.id}
            onSelect={() => selectColor(c.id)}
            width={96}
            isNew={isNewlyUnlocked(c.id)}
          >
            <ColorSwatchBody entry={c} />
          </SwatchShell>
        ))}
      </Rail>

      <Rail label="Avatar Frame">
        {frames.map((f) => (
          <SwatchShell
            key={f.id}
            label={f.label}
            requiredLevel={f.requiredLevel}
            owned={isOwned(f.id)}
            selected={frameSelection === f.id}
            onSelect={() => selectFrame(f.id)}
            width={96}
            isNew={isNewlyUnlocked(f.id)}
          >
            <FrameSwatchBody entry={f} />
          </SwatchShell>
        ))}
      </Rail>

      <Rail label="Profile Background">
        {backgrounds.map((b) => (
          <SwatchShell
            key={b.id}
            label={b.label}
            requiredLevel={b.requiredLevel}
            owned={isOwned(b.id)}
            selected={backgroundSelection === b.id}
            onSelect={() => selectBackground(b.id)}
            width={128}
            height={84}
            isNew={isNewlyUnlocked(b.id)}
          >
            <BackgroundSwatchBody entry={b} />
          </SwatchShell>
        ))}
      </Rail>
    </div>
  );
}
