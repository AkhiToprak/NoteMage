'use client';

import * as React from 'react';
import { UserName, type UserNameUser } from '@/components/user/UserName';
import { UserAvatar } from '@/components/user/UserAvatar';
import { ProfileBackground } from '@/components/cosmetics/ProfileBackground';
import { COSMETICS } from '@/lib/cosmetics/catalog';
import { useBreakpoint } from '@/hooks/useBreakpoint';

/**
 * Left-biased identity strip. Replaces the centered-on-the-axis hero card
 * that both /profile and /profile/[username] previously rendered. Shape:
 *
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │ ┌────┐  Display Name             title                       │ ← row
 *   │ │ AV │  @handle · joined Mar 2025                            │
 *   │ └────┘                                              [action] │
 *   │                                                                │
 *   │ Bio runs here as a single paragraph, 60ch ceiling so the      │
 *   │ measure stays readable on wide desktops.                       │
 *   │                                                                │
 *   │ [Basel, CH] [Uni Basel] [Student]                              │ ← chips
 *   └─────────────────────────────────────────────────────────────┘
 *
 * On phone: avatar + name stack, chips wrap.
 *
 * The optional ProfileBackground cosmetic renders as a clipped band
 * behind the section. Each background variant already paints its own
 * readability falloff so we don't need to add a gradient mask (project
 * rule forbids gradients).
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
  /**
   * Optional action slot rendered right-flush on desktop, full-width on
   * phone. Both pages use this for the Edit / Add-friend / locked state.
   */
  action?: React.ReactNode;
  /**
   * Optional badge row above the name — used by the self-edit page to
   * surface "Private" / "Achievements hidden" pills the public view
   * doesn't show.
   */
  badges?: React.ReactNode;
}

function formatJoined(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
  });
}

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

  return (
    <section
      style={{
        position: 'relative',
        // Clipped band so the equipped background doesn't bleed past the
        // hero region. No gradient mask — clip is honest.
        overflow: 'hidden',
        borderRadius: isPhone ? 20 : 24,
        // Hero sits on a subtle elevation step so the equipped background
        // has a frame even when none is equipped (otherwise the band
        // disappears into the page bg). Light theme picks up the auto
        // outline from globals.css.
        background: hasBackground ? 'transparent' : 'var(--surface-container-low)',
        padding: isPhone ? '24px 20px 22px' : '36px 40px 32px',
      }}
    >
      {hasBackground && (
        <ProfileBackground
          backgroundId={user.equippedBackgroundId}
          customBackgroundUrl={user.customBackgroundUrl}
          radius={isPhone ? 20 : 24}
        />
      )}

      <div
        style={{
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          flexDirection: isPhone ? 'column' : 'row',
          alignItems: isPhone ? 'flex-start' : 'center',
          gap: isPhone ? '16px' : '24px',
        }}
      >
        {/* Avatar */}
        <UserAvatar
          user={user}
          size={isPhone ? 72 : 96}
          radius="50%"
          style={
            hasFrame
              ? undefined
              : { border: '3px solid var(--brand-purple-edge)', flexShrink: 0 }
          }
        />

        {/* Name + meta column */}
        <div style={{ flex: 1, minWidth: 0, width: '100%' }}>
          {badges && (
            <div
              style={{
                display: 'flex',
                gap: '6px',
                flexWrap: 'wrap',
                marginBottom: '6px',
              }}
            >
              {badges}
            </div>
          )}
          <UserName
            user={user}
            as="div"
            showTitle
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: isPhone ? 24 : 32,
              fontWeight: 700,
              letterSpacing: '-0.02em',
              color: 'var(--on-surface)',
              lineHeight: 1.1,
              marginBottom: '4px',
              overflowWrap: 'anywhere',
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
        </div>

        {/* Action slot — right-flush on desktop, full-width on phone */}
        {action && (
          <div
            style={{
              flexShrink: 0,
              width: isPhone ? '100%' : 'auto',
              marginTop: isPhone ? '4px' : 0,
            }}
          >
            {action}
          </div>
        )}
      </div>

      {/* Bio paragraph — only renders when set. Sits below the row at
          60ch so the measure stays readable. */}
      {user.bio && (
        <p
          style={{
            position: 'relative',
            zIndex: 1,
            marginTop: '18px',
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

      {/* Meta chips — location, school, work, age. Wrap freely on phone. */}
      {chips.length > 0 && (
        <div
          style={{
            position: 'relative',
            zIndex: 1,
            marginTop: '16px',
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
                padding: '4px 10px',
                borderRadius: 'var(--radius-full)',
                background: 'var(--brand-purple-wash)',
                color: 'var(--on-surface)',
                fontSize: '12px',
                fontWeight: 600,
                lineHeight: 1.4,
              }}
            >
              <span
                className="material-symbols-outlined"
                aria-hidden
                style={{ fontSize: '14px', color: 'var(--brand-purple-strong)' }}
              >
                {c.icon}
              </span>
              {c.label}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
