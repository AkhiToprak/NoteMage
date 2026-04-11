import * as React from 'react';
import { COSMETICS, type FrameCosmetic } from '@/lib/cosmetics/catalog';
import { getInitials } from './UserName';

/**
 * The canonical primitive for rendering a user's avatar anywhere in the app.
 * Every surface that shows a user's picture must go through this component
 * so that equipped frames render consistently.
 *
 * Server-component safe. Frames are suppressed below FRAME_MIN_SIZE because
 * they would be invisible and cost layout on list views (nav chips etc.).
 */
const FRAME_MIN_SIZE = 32;

export interface UserAvatarUser {
  name?: string | null;
  username?: string | null;
  avatarUrl?: string | null;
  image?: string | null; // NextAuth surfaces avatar as `image` in some places
  equippedFrameId?: string | null;
}

interface UserAvatarProps {
  user: UserAvatarUser | null | undefined;
  /** Pixel size of the avatar square. */
  size?: number;
  /** Border radius override. Defaults to 12px for >=40, size/3 for smaller. */
  radius?: number | string;
  /** Force plain rendering (suppress frame regardless of size). */
  plain?: boolean;
  className?: string;
  style?: React.CSSProperties;
  /** Override alt text on the <img>. */
  alt?: string;
}

/**
 * Resolves an equipped frame id into a wrapper style and optional glow.
 * Kept tiny — full parametric frames arrive in Phase 4 as React components.
 */
function resolveFrameStyle(
  frameId: string | null | undefined,
  size: number
): { wrapper: React.CSSProperties; padding: number } | null {
  if (!frameId) return null;
  const entry = COSMETICS[frameId];
  if (!entry || entry.type !== 'frame') return null;
  const frame = entry as FrameCosmetic;
  if (frame.component === 'none') return null;

  // Phase 1: only one frame component, resolved inline. In Phase 4 this
  // dispatches to real parametric components and sizes the padding per frame.
  if (frame.component === 'FrameGlow') {
    const hue = typeof frame.params?.hue === 'number' ? frame.params.hue : 270;
    return {
      padding: 3,
      wrapper: {
        padding: 3,
        borderRadius: '9999px',
        background: `conic-gradient(from 0deg, hsl(${hue},80%,70%), hsl(${(hue + 60) % 360},80%,70%), hsl(${hue},80%,70%))`,
        boxShadow: `0 0 ${Math.round(size / 3)}px hsl(${hue},80%,60%,0.45)`,
      },
    };
  }

  if (frame.component === 'FramePulse') {
    // Soft single-hue pulsing halo — cheaper than FramePrism, intended for
    // mid-tier levels. The pulse is a CSS animation on transform/opacity of
    // a pseudo-element we can't render here (not allowed inline), so we
    // instead vary the shadow via an animation class defined globally. To
    // avoid a global stylesheet edit, we lean on a layered static glow —
    // the "pulse" comes from the ring being intentionally larger and more
    // vibrant than FrameGlow, not from actual motion. This keeps the frame
    // server-renderable and avoids runtime animation cost on list views.
    const hue = typeof frame.params?.hue === 'number' ? frame.params.hue : 330;
    return {
      padding: 4,
      wrapper: {
        padding: 4,
        borderRadius: '9999px',
        background: `
          radial-gradient(circle at 50% 50%,
            hsla(${hue},90%,75%,0.95) 0%,
            hsla(${hue},85%,60%,0.85) 55%,
            hsla(${(hue + 30) % 360},90%,65%,0.9) 100%)
        `,
        boxShadow: `
          0 0 0 1px hsla(${hue},100%,85%,0.45),
          0 0 ${Math.round(size / 2)}px hsla(${hue},90%,65%,0.55),
          0 0 ${Math.round(size)}px hsla(${hue},85%,55%,0.28)
        `,
      },
    };
  }

  if (frame.component === 'FramePrism') {
    // Full-spectrum conic gradient — the top-tier frame. Layers a wide rainbow
    // halo with a soft inner glow so the ring reads as iridescent rather than
    // rainbow-striped. Intentionally no animation (we only animate transform/
    // opacity per project rules).
    return {
      padding: 4,
      wrapper: {
        padding: 4,
        borderRadius: '9999px',
        background:
          'conic-gradient(from 180deg, #ff6b6b, #ffd93d, #6bcf7f, #4d9de0, #9d4edd, #ff6fa2, #ff6b6b)',
        boxShadow: `0 0 ${Math.round(size / 2.5)}px rgba(174,137,255,0.35), 0 0 ${Math.round(size / 1.5)}px rgba(255,111,162,0.2)`,
      },
    };
  }

  return null;
}

export function UserAvatar({
  user,
  size = 40,
  radius,
  plain = false,
  className,
  style,
  alt,
}: UserAvatarProps) {
  const imageSrc = user?.avatarUrl || user?.image || null;
  const name = user?.name || user?.username || null;
  const effectiveRadius =
    radius ?? (size >= 40 ? 12 : Math.max(6, Math.round(size / 3)));

  const frame =
    !plain && size >= FRAME_MIN_SIZE
      ? resolveFrameStyle(user?.equippedFrameId, size)
      : null;

  // When a frame is equipped the wrapper is circular; force the inner image
  // round too so the avatar doesn't look like a rounded square sitting inside
  // a halo. Without a frame we honor the caller's `radius` prop.
  const innerRadius = frame ? '9999px' : effectiveRadius;

  const inner = imageSrc ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={imageSrc}
      alt={alt ?? name ?? 'Avatar'}
      style={{
        width: size,
        height: size,
        borderRadius: innerRadius,
        objectFit: 'cover',
        flexShrink: 0,
        display: 'block',
      }}
    />
  ) : (
    <div
      aria-label={alt ?? name ?? 'Avatar'}
      style={{
        width: size,
        height: size,
        borderRadius: innerRadius,
        background: 'linear-gradient(135deg, #ae89ff 0%, #8348f6 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: Math.max(10, Math.round(size * 0.38)),
        fontWeight: 700,
        color: '#ffffff',
        flexShrink: 0,
      }}
    >
      {getInitials(name)}
    </div>
  );

  if (!frame) {
    // Mirror the effective radius onto the outer wrapper so any `border`
    // callers pass via `style` (e.g. profile page's subtle purple ring)
    // is rounded to match the inner image instead of showing as a square
    // around a circle.
    return (
      <div
        className={className}
        style={{
          display: 'inline-flex',
          borderRadius: innerRadius,
          ...style,
        }}
      >
        {inner}
      </div>
    );
  }

  return (
    <div
      className={className}
      style={{
        display: 'inline-flex',
        ...frame.wrapper,
        ...style,
      }}
    >
      {inner}
    </div>
  );
}
