import * as React from 'react';
import { COSMETICS, type BackgroundCosmetic } from '@/lib/cosmetics/catalog';

/**
 * Renders an equipped profile background as an absolutely-positioned layer.
 * Drop it as the first child of the profile header card and it fills the
 * parent. Unknown / default / unset ids render nothing.
 *
 * Parametric — one React component per `component` id in the catalog. To
 * add a new background type, add a new branch here and a new catalog entry.
 */
interface ProfileBackgroundProps {
  backgroundId?: string | null;
  /**
   * Admin-only custom background image URL. Overrides `backgroundId` when
   * present. Set through the admin GIF upload flow; no catalog entry
   * backs it so the catalog stays pure code.
   */
  customBackgroundUrl?: string | null;
  /** Border radius to match the parent surface (so we don't clip wrong). */
  radius?: number | string;
  /** Extra className on the wrapper. */
  className?: string;
  style?: React.CSSProperties;
}

export function ProfileBackground({
  backgroundId,
  customBackgroundUrl,
  radius = 24,
  className,
  style,
}: ProfileBackgroundProps) {
  // Admin custom background wins over every catalog entry. Rendered as a
  // plain <img> so GIFs animate natively and the browser handles caching.
  if (customBackgroundUrl) {
    return (
      <div
        aria-hidden
        className={className}
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: radius,
          overflow: 'hidden',
          pointerEvents: 'none',
          ...style,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={customBackgroundUrl}
          alt=""
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
        />
        {/* Readability falloff so light content on top still stands out. */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(17,17,38,0.55)',
          }}
        />
      </div>
    );
  }

  const entry = backgroundId ? COSMETICS[backgroundId] : null;
  if (!entry || entry.type !== 'background') return null;
  const bg = entry as BackgroundCosmetic;
  if (bg.component === 'none') return null;

  const baseWrapperStyle: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    borderRadius: radius,
    overflow: 'hidden',
    pointerEvents: 'none',
    ...style,
  };

  if (bg.component === 'BackgroundGeometric') {
    // Alternating chevron stripes with a primary-tinted wash underneath.
    const hue = typeof bg.params?.hue === 'number' ? bg.params.hue : 260;
    return (
      <div aria-hidden className={className} style={baseWrapperStyle}>
        {/* Deep wash — two stops so corners fade slightly darker */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: `hsla(${hue},60%,22%,0.95)`,
          }}
        />
        {/* Chevron layer 1 — diagonal up */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: `hsla(${hue},85%,72%,0.09)`,
          }}
        />
        {/* Chevron layer 2 — diagonal down, slightly thicker + warmer tint */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: `hsla(${(hue + 40) % 360},95%,70%,0.07)`,
          }}
        />
        {/* Spotlight bloom on the top third to draw the eye up */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: `hsla(${hue},90%,60%,0.35)`,
            filter: 'blur(28px)',
          }}
        />
        {/* Readability falloff */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(17,17,38,0.58)',
          }}
        />
      </div>
    );
  }

  if (bg.component === 'BackgroundMesh') {
    const hue = typeof bg.params?.hue === 'number' ? bg.params.hue : 270;
    return (
      <div aria-hidden className={className} style={baseWrapperStyle}>
        {/* Base wash: primary-tinted deep violet with a subtle center bloom */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: `hsla(${hue}, 60%, 18%, 0.9)`,
          }}
        />
        {/* Diagonal grid layer. Thin, high-density lines with a slight primary tint. */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: `hsla(${hue}, 90%, 78%, 0.14)`,
          }}
        />
        {/* Horizon glow sweep */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: `hsla(${(hue + 40) % 360}, 95%, 65%, 0.35)`,
            filter: 'blur(20px)',
          }}
        />
        {/* Readability falloff */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(17,17,38,0.5)',
          }}
        />
      </div>
    );
  }

  if (bg.component === 'BackgroundConstellation') {
    const dotLayers = 'rgba(255,255,255,0.7)';

    return (
      <div aria-hidden className={className} style={baseWrapperStyle}>
        {/* Deep-space base: near-black indigo with a single cool bloom */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: '#06061a',
          }}
        />
        {/* Star dots (bright layer) */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: dotLayers,
            opacity: 0.05,
          }}
        />
        {/* Faint connecting lines — two long diagonals kept subtle so the
            constellation reading is suggested, not spelled out. */}
        <svg
          width="100%"
          height="100%"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          style={{ position: 'absolute', inset: 0, opacity: 0.35 }}
        >
          <line x1="22" y1="32" x2="44" y2="52" stroke="rgba(185,195,255,0.6)" strokeWidth="0.15" />
          <line x1="44" y1="52" x2="72" y2="58" stroke="rgba(185,195,255,0.6)" strokeWidth="0.15" />
          <line x1="72" y1="58" x2="90" y2="42" stroke="rgba(185,195,255,0.6)" strokeWidth="0.15" />
          <line x1="52" y1="12" x2="64" y2="36" stroke="rgba(185,195,255,0.6)" strokeWidth="0.15" />
          <line x1="64" y1="36" x2="44" y2="52" stroke="rgba(185,195,255,0.6)" strokeWidth="0.15" />
        </svg>
        {/* Readability falloff */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(6,6,26,0.55)',
          }}
        />
      </div>
    );
  }

  if (bg.component === 'BackgroundAurora') {
    const hue = typeof bg.params?.hue === 'number' ? bg.params.hue : 270;
    return (
      <div
        aria-hidden
        className={className}
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: radius,
          overflow: 'hidden',
          pointerEvents: 'none',
          ...style,
        }}
      >
        {/* Two offset radial bloom layers + a grain overlay. Pure CSS,
            animates via keyframes defined in globals.css — if absent it
            falls back to a static gradient. */}
        <div
          style={{
            position: 'absolute',
            inset: '-20%',
            background: `hsla(${hue}, 85%, 65%, 0.55)`,
            filter: 'blur(40px) saturate(130%)',
            opacity: 0.9,
          }}
        />
        {/* Grain overlay using SVG noise */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.4 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
            mixBlendMode: 'overlay',
            opacity: 0.15,
          }}
        />
        {/* Top falloff so the card content stays readable */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(17,17,38,0.55)',
          }}
        />
      </div>
    );
  }

  return null;
}
