import * as React from 'react';
import { COSMETICS, type NameColorCosmetic, type NameFontCosmetic } from '@/lib/cosmetics/catalog';

/**
 * The canonical primitive for rendering a user's display name anywhere in the
 * app. Every surface that shows a username must go through this component so
 * that name font + color cosmetics apply consistently.
 *
 * Server-component safe: no hooks, no session reads. Callers pass in the
 * styled subset of the user. The shape is loose on purpose so it accepts
 * payloads from REST, Prisma, sockets, and the NextAuth session without
 * adapters.
 */
export interface UserNameStyle {
  fontId?: string | null;
  colorId?: string | null;
}

export interface UserNameUser {
  name?: string | null;
  username?: string | null;
  nameStyle?: UserNameStyle | null;
  equippedTitleId?: string | null;
}

interface UserNameProps {
  user: UserNameUser | null | undefined;
  /** Fallback text when both name and username are missing. */
  fallback?: string;
  /** Show the equipped title next to the name (e.g. chat bylines, profile). */
  showTitle?: boolean;
  /** Force plain rendering (ignore any cosmetic styling). */
  plain?: boolean;
  /**
   * Use `username` as the primary text even when `name` exists. Some surfaces
   * (friends list, add-friend modal, group member rolls) display the unique
   * handle as the primary identifier with the real name as a subtitle.
   */
  preferUsername?: boolean;
  /** Extra inline styles merged onto the outer span. */
  style?: React.CSSProperties;
  className?: string;
  /** Optional element override — defaults to <span>. */
  as?: 'span' | 'div' | 'p';
}

/**
 * Resolves a user's nameStyle into the concrete CSS needed to paint the
 * name. Pure — safe to call in render.
 */
function resolveNameStyle(style: UserNameStyle | null | undefined): React.CSSProperties {
  if (!style) return {};
  const out: React.CSSProperties = {};

  const font = style.fontId ? COSMETICS[style.fontId] : null;
  if (font && font.type === 'nameFont') {
    out.fontFamily = (font as NameFontCosmetic).css;
  }

  const color = style.colorId ? COSMETICS[style.colorId] : null;
  if (color && color.type === 'nameColor') {
    const c = color as NameColorCosmetic;
    if (c.gradient) {
      out.backgroundImage = c.css;
      out.backgroundClip = 'text';
      out.WebkitBackgroundClip = 'text';
      out.color = 'transparent';
      out.WebkitTextFillColor = 'transparent';
    } else {
      out.color = c.css;
    }
  }

  return out;
}

export function UserName({
  user,
  fallback = 'Unknown',
  showTitle = false,
  plain = false,
  preferUsername = false,
  style,
  className,
  as = 'span',
}: UserNameProps) {
  const displayName = preferUsername
    ? user?.username || user?.name || fallback
    : user?.name || user?.username || fallback;
  const resolved = plain ? {} : resolveNameStyle(user?.nameStyle ?? null);
  // Pull the font out so we can apply it to BOTH the outer element and the
  // inner span. Belt-and-braces: some call sites hardcode
  // `fontFamily: 'var(--font-display)'` on the outer wrapper via `style`
  // (silently defeating the cosmetic font through inheritance), and some
  // wrappers further up the tree set their own fontFamily which would beat
  // an outer-only declaration. Setting it on both the Element and the inner
  // span guarantees the name itself always renders in the picked font.
  const { fontFamily: resolvedFont, ...resolvedColor } = resolved;
  const Element = as;

  const titleEntry =
    showTitle && user?.equippedTitleId ? COSMETICS[user.equippedTitleId] : null;
  const titleLabel = titleEntry && titleEntry.type === 'title' ? titleEntry.label : null;

  return (
    <Element
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'baseline',
        gap: '6px',
        ...style,
        // Force the cosmetic font to win over any fontFamily in `style`.
        ...(resolvedFont ? { fontFamily: resolvedFont } : {}),
      }}
    >
      <span
        style={{
          // Re-assert the cosmetic font directly on the name span so nothing
          // between here and the glyph can override it. Color/gradient stay
          // here too so the equipped title doesn't inherit the gradient.
          ...(resolvedFont ? { fontFamily: resolvedFont } : {}),
          ...resolvedColor,
        }}
      >
        {displayName}
      </span>
      {titleLabel && (
        <span
          style={{
            // Pin the title to the body font so it stays readable even when
            // the name picks a display/mono font.
            fontFamily: 'var(--font-sans)',
            fontSize: '0.75em',
            color: 'var(--on-surface-variant)',
            fontWeight: 500,
            letterSpacing: '0.02em',
          }}
        >
          {titleLabel}
        </span>
      )}
    </Element>
  );
}

/**
 * Lightweight helper for the many places that already compute initials by
 * hand. Kept in the same module so migrating call sites is a single import.
 */
export function getInitials(name?: string | null): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0]!.charAt(0).toUpperCase();
  return (parts[0]!.charAt(0) + parts[parts.length - 1]!.charAt(0)).toUpperCase();
}
