'use client';

import * as React from 'react';
import { UserName, type UserNameUser } from '@/components/user/UserName';
import { UserAvatar } from '@/components/user/UserAvatar';
import { ProfileBackground } from '@/components/cosmetics/ProfileBackground';
import { COSMETICS } from '@/lib/cosmetics/catalog';
import { useBreakpoint } from '@/hooks/useBreakpoint';

/**
 * Profile hero, banner-pattern (Twitter / GitHub shape).
 *
 *   ┌─────────────────────────────────────────────────────┐
 *   │            BANNER (custom bg or accent band)         │   only when equipped
 *   │                                                       │
 *   ├──────────────────────────────────────────────────────┤
 *   │  ⬤             Display Name · title    [Edit btn]   │   avatar overlaps banner
 *   │  AVT           @handle · Joined Mar 2025              │
 *   │                Bio paragraph, 60ch ceiling.           │
 *   │                [Switzerland] [18] [Chips]             │
 *   └──────────────────────────────────────────────────────┘
 *
 * The v1 rework put text directly on top of the custom photo with a
 * 55 % readability dim, which collapsed on high-contrast face photos.
 * v2 separates banner from identity: text never overlaps the photo, so
 * any uploaded image renders legibly regardless of its contrast.
 *
 * When no background is equipped the banner is omitted entirely and the
 * hero becomes a single identity card — same shape, just no top band.
 */
export interface ProfileHeroUser extends UserNameUser {
  id: string;
  avatarUrl?: string | null;
  bio?: string | null;
  createdAt: string;
  location?: string | null;
  school?: string | null;
  lineOfWork?: string | null;
  age?: number | null;
  equippedFrameId?: string | null;
  equippedBackgroundId?: string | null;
  customBackgroundUrl?: string | null;
}

interface ProfileHeroProps {
  user: ProfileHeroUser;
  /** Right-flush action — Edit button on self-view, friend CTA on public. */
  action?: React.ReactNode;
  /** Optional badge row above the name (Private / hidden pills). */
  badges?: React.ReactNode;
}

function formatJoined(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
  });
}

// Banner heights — narrow on phone so the identity card stays above the
// fold, taller on desktop where there's room for the photo to breathe.
const BANNER_H_DESKTOP = 140;
const BANNER_H_PHONE = 96;

const AVATAR_DESKTOP = 88;
const AVATAR_PHONE = 72;

export function ProfileHero({ user, action, badges }: ProfileHeroProps) {
  const { isPhone } = useBreakpoint();
  const hasFrame = Boolean(
    user.equippedFrameId &&
      COSMETICS[user.equippedFrameId]?.type === 'frame' &&
      (COSMETICS[user.equippedFrameId] as { component?: string })?.component !== 'none'
  );

  const chips: { key: string; label: string; icon: string }[] = [];
  if (user.location) chips.push({ key: 'location', label: user.location, icon: 'location_on' });
  if (user.school) chips.push({ key: 'school', label: user.school, icon: 'school' });
  if (user.lineOfWork) chips.push({ key: 'work', label: user.lineOfWork, icon: 'work' });
  if (user.age != null) chips.push({ key: 'age', label: `${user.age} years old`, icon: 'person' });

  const hasBackground = Boolean(user.equippedBackgroundId || user.customBackgroundUrl);
  const bannerH = isPhone ? BANNER_H_PHONE : BANNER_H_DESKTOP;
  const avatarSize = isPhone ? AVATAR_PHONE : AVATAR_DESKTOP;
  // Avatar visually overlaps the banner by half its height on desktop,
  // 60 % on phone (so more of the avatar sits in the identity area where
  // the frame ring reads cleanly against the solid surface).
  const avatarOverlap = hasBackground ? Math.round(avatarSize * (isPhone ? 0.6 : 0.55)) : 0;

  return (
    <section
      style={{
        position: 'relative',
        borderRadius: isPhone ? 20 : 24,
        overflow: 'hidden',
        background: 'var(--surface-container-low)',
      }}
    >
      {/* Banner — only renders when a background cosmetic is equipped.
          ProfileBackground absolutely fills its parent, so we wrap it in
          a fixed-height box. */}
      {hasBackground && (
        <div
          aria-hidden
          style={{
            position: 'relative',
            width: '100%',
            height: bannerH,
            overflow: 'hidden',
          }}
        >
          <ProfileBackground
            backgroundId={user.equippedBackgroundId}
            customBackgroundUrl={user.customBackgroundUrl}
            radius={0}
          />
        </div>
      )}

      {/* Identity card */}
      <div
        style={{
          position: 'relative',
          padding: isPhone
            ? `${hasBackground ? 12 : 22}px 20px 22px`
            : `${hasBackground ? 16 : 28}px 32px 28px`,
        }}
      >
        {/* Action — top-right, sits inside the identity card so it never
            overlaps the banner. On phone it goes underneath the chips
            instead (handled via the bottom-of-card slot below). */}
        {!isPhone && action && (
          <div style={{ position: 'absolute', top: hasBackground ? 16 : 28, right: 32 }}>
            {action}
          </div>
        )}

        {/* Avatar — sits at the boundary between banner and identity card
            when banner is present (negative margin pulls it up over the
            banner edge), normal flow otherwise. Belted by a thick ring
            in the card's surface color so it punches out of the banner. */}
        <div
          style={{
            marginTop: hasBackground ? -avatarOverlap : 0,
            marginBottom: hasBackground ? 12 : 0,
            display: 'inline-block',
          }}
        >
          <UserAvatar
            user={user}
            size={avatarSize}
            radius="50%"
            style={
              hasFrame
                ? undefined
                : {
                    // Solid ring in the surface color so the avatar reads
                    // as cleanly "set into" the identity card when it
                    // overlaps the banner. Without this the avatar sits
                    // on the photo edge with no separation.
                    border: '4px solid var(--surface-container-low)',
                    boxShadow: hasBackground
                      ? '0 4px 16px var(--bento-rest-shadow)'
                      : 'none',
                  }
            }
          />
        </div>

        {/* Badges (Private / Hidden) — narrow row above the name. */}
        {badges && (
          <div
            style={{
              display: 'flex',
              gap: '6px',
              flexWrap: 'wrap',
              marginBottom: '6px',
              paddingRight: !isPhone && action ? '128px' : 0,
            }}
          >
            {badges}
          </div>
        )}

        {/* Name + meta row */}
        <UserName
          user={user}
          as="div"
          showTitle
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: isPhone ? 22 : 28,
            fontWeight: 700,
            letterSpacing: '-0.02em',
            color: 'var(--on-surface)',
            lineHeight: 1.15,
            marginBottom: '4px',
            overflowWrap: 'anywhere',
            // Reserve space for the top-right action button on desktop
            // so a long name doesn't crash into it.
            paddingRight: !isPhone && action ? '128px' : 0,
          }}
        />
        <div
          style={{
            display: 'flex',
            gap: '8px',
            alignItems: 'center',
            color: 'var(--on-surface-variant)',
            fontSize: '13px',
            flexWrap: 'wrap',
          }}
        >
          <span>@{user.username}</span>
          <span aria-hidden style={{ opacity: 0.5 }}>·</span>
          <span>Joined {formatJoined(user.createdAt)}</span>
        </div>

        {/* Bio — only when set, 60ch measure. */}
        {user.bio && (
          <p
            style={{
              marginTop: '14px',
              marginBottom: 0,
              maxWidth: '60ch',
              fontSize: isPhone ? '14px' : '15px',
              lineHeight: 1.55,
              color: 'var(--on-surface)',
              overflowWrap: 'anywhere',
            }}
          >
            {user.bio}
          </p>
        )}

        {/* Chips */}
        {chips.length > 0 && (
          <div
            style={{
              marginTop: '14px',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '8px',
            }}
          >
            {chips.map((c) => (
              <span
                key={c.key}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '5px 11px',
                  borderRadius: 'var(--radius-full)',
                  background: 'var(--brand-purple-wash)',
                  border: '1px solid var(--brand-purple-edge)',
                  color: 'var(--on-surface)',
                  fontSize: '12px',
                  fontWeight: 600,
                  lineHeight: 1.4,
                }}
              >
                <span
                  className="material-symbols-outlined"
                  aria-hidden
                  style={{ fontSize: '14px', color: 'var(--md-h4)' }}
                >
                  {c.icon}
                </span>
                {c.label}
              </span>
            ))}
          </div>
        )}

        {/* Phone action — full-width row at the bottom of the identity
            card so the thumb can reach it without the top-right
            placement being too cramped on narrow viewports. */}
        {isPhone && action && (
          <div style={{ marginTop: '16px', display: 'flex' }}>
            <div style={{ flex: 1 }}>{action}</div>
          </div>
        )}
      </div>
    </section>
  );
}
