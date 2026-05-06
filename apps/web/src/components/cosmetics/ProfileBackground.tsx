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
            background: 'linear-gradient(180deg, rgba(17,17,38,0.18) 0%, rgba(17,17,38,0.55) 100%)',
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
    // The stripe pattern is two repeating-linear-gradients offset by half a
    // period so they interlock into a chevron. Keeps the whole thing pure
    // CSS with no SVG or asset round-trips.
    const hue = typeof bg.params?.hue === 'number' ? bg.params.hue : 260;
    return (
      <div aria-hidden className={className} style={baseWrapperStyle}>
        {/* Deep wash — two stops so corners fade slightly darker */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: `
              linear-gradient(135deg, hsla(${hue},60%,22%,0.95) 0%, hsla(${(hue + 20) % 360},55%,14%,0.95) 100%)
            `,
          }}
        />
        {/* Chevron layer 1 — diagonal up */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `repeating-linear-gradient(
              45deg,
              hsla(${hue},85%,72%,0.09) 0px,
              hsla(${hue},85%,72%,0.09) 2px,
              transparent 2px,
              transparent 22px
            )`,
          }}
        />
        {/* Chevron layer 2 — diagonal down, slightly thicker + warmer tint */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `repeating-linear-gradient(
              -45deg,
              hsla(${(hue + 40) % 360},95%,70%,0.07) 0px,
              hsla(${(hue + 40) % 360},95%,70%,0.07) 3px,
              transparent 3px,
              transparent 26px
            )`,
          }}
        />
        {/* Spotlight bloom on the top third to draw the eye up */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: `radial-gradient(80% 50% at 50% 0%, hsla(${hue},90%,60%,0.35) 0%, transparent 65%)`,
            filter: 'blur(28px)',
          }}
        />
        {/* Readability falloff */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(180deg, rgba(17,17,38,0.12) 0%, rgba(17,17,38,0.58) 100%)',
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
            background: `
              radial-gradient(120% 80% at 50% 0%, hsla(${hue}, 75%, 55%, 0.28) 0%, transparent 60%),
              linear-gradient(180deg, hsla(${hue}, 60%, 18%, 0.9) 0%, hsla(${(hue + 30) % 360}, 55%, 12%, 0.95) 100%)
            `,
          }}
        />
        {/* Diagonal grid via two crossed linear-gradients. Thin, high-density
            lines with a slight primary tint so it reads as a blueprint mesh. */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `
              linear-gradient(45deg, hsla(${hue}, 90%, 78%, 0.14) 1px, transparent 1px),
              linear-gradient(-45deg, hsla(${hue}, 90%, 78%, 0.14) 1px, transparent 1px)
            `,
            backgroundSize: '28px 28px, 28px 28px',
            maskImage: 'radial-gradient(120% 120% at 50% 30%, #000 40%, transparent 90%)',
            WebkitMaskImage: 'radial-gradient(120% 120% at 50% 30%, #000 40%, transparent 90%)',
          }}
        />
        {/* Horizon glow sweep */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: `radial-gradient(80% 40% at 50% 110%, hsla(${(hue + 40) % 360}, 95%, 65%, 0.35) 0%, transparent 60%)`,
            filter: 'blur(20px)',
          }}
        />
        {/* Readability falloff */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(180deg, rgba(17,17,38,0.05) 0%, rgba(17,17,38,0.5) 100%)',
          }}
        />
      </div>
    );
  }

  if (bg.component === 'BackgroundConstellation') {
    // Deterministic star field — positions chosen so it reads as a scattered
    // constellation rather than a regular grid. We bake them in radial-gradient
    // syntax (one dot per gradient) which keeps everything pure CSS and avoids
    // SSR hydration mismatches that would come from Math.random().
    const stars = [
      { x: 8, y: 18, s: 1.2, o: 0.9 },
      { x: 14, y: 62, s: 0.9, o: 0.6 },
      { x: 22, y: 32, s: 1.6, o: 1 },
      { x: 30, y: 74, s: 1, o: 0.7 },
      { x: 38, y: 20, s: 0.8, o: 0.5 },
      { x: 44, y: 52, s: 1.4, o: 0.95 },
      { x: 52, y: 12, s: 1, o: 0.8 },
      { x: 58, y: 80, s: 1.8, o: 1 },
      { x: 64, y: 36, s: 0.9, o: 0.6 },
      { x: 72, y: 58, s: 1.3, o: 0.9 },
      { x: 78, y: 24, s: 1.1, o: 0.75 },
      { x: 84, y: 70, s: 0.9, o: 0.55 },
      { x: 90, y: 42, s: 1.5, o: 1 },
      { x: 18, y: 88, s: 0.8, o: 0.5 },
      { x: 48, y: 92, s: 1, o: 0.7 },
      { x: 96, y: 14, s: 1.2, o: 0.85 },
    ];
    const dotLayers = stars
      .map(
        (s) =>
          `radial-gradient(${s.s}px ${s.s}px at ${s.x}% ${s.y}%, rgba(255,255,255,${s.o}) 0%, rgba(255,255,255,0) 100%)`
      )
      .join(', ');

    return (
      <div aria-hidden className={className} style={baseWrapperStyle}>
        {/* Deep-space base: near-black indigo with a single cool bloom */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: `
              radial-gradient(80% 60% at 70% 20%, rgba(77, 157, 224, 0.35) 0%, transparent 60%),
              radial-gradient(70% 70% at 20% 80%, rgba(157, 78, 221, 0.28) 0%, transparent 65%),
              linear-gradient(180deg, #06061a 0%, #0a0a24 100%)
            `,
          }}
        />
        {/* Star dots (bright layer) */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: dotLayers,
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
            background: 'linear-gradient(180deg, rgba(6,6,26,0.1) 0%, rgba(6,6,26,0.55) 100%)',
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
            background: `
              radial-gradient(60% 70% at 20% 30%, hsla(${hue}, 85%, 65%, 0.55) 0%, transparent 60%),
              radial-gradient(55% 60% at 80% 70%, hsla(${(hue + 40) % 360}, 85%, 65%, 0.45) 0%, transparent 60%),
              radial-gradient(50% 55% at 50% 100%, hsla(${(hue + 300) % 360}, 90%, 60%, 0.35) 0%, transparent 55%)
            `,
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
            background: 'linear-gradient(180deg, rgba(17,17,38,0.15) 0%, rgba(17,17,38,0.55) 100%)',
          }}
        />
      </div>
    );
  }

  return null;
}
