'use client';

import { useState } from 'react';
import { useBreakpoint } from '@/hooks/useBreakpoint';

interface SocialsCardProps {
  friendsCount: number;
  instagramHandle: string | null;
  linkedinUrl: string | null;
  /** 'none' | 'pending_sent' | 'pending_received' | 'accepted' | null */
  friendshipStatus: string | null;
  friendshipId: string | null;
  username: string;
  isOwnProfile: boolean;
  isAuthenticated: boolean;
  onFriendshipChange?: (next: { status: string; id: string | null }) => void;
}

/**
 * Social card on the public + self-edit profiles. Used to be a stacked
 * eyebrow + 52px friend count + tile row + action. The 52px display has
 * moved to ProfileAnchorStat (trophies are the page's typographic peak
 * now), so this card carries a more modest friend count + social link
 * tiles + the friend-request action.
 *
 * Mutation logic mirrors the previous in-page handler — the parent
 * still owns `friendshipStatus`/`friendshipId` and receives updates via
 * the `onFriendshipChange` callback so other UI stays in sync.
 */
export default function SocialsCard({
  friendsCount,
  instagramHandle,
  linkedinUrl,
  friendshipStatus,
  friendshipId,
  username,
  isOwnProfile,
  isAuthenticated,
  onFriendshipChange,
}: SocialsCardProps) {
  const { isPhone } = useBreakpoint();
  const [sendingRequest, setSendingRequest] = useState(false);
  const [friendError, setFriendError] = useState<string | null>(null);

  const handleFriendRequest = async () => {
    if (sendingRequest) return;
    setSendingRequest(true);
    setFriendError(null);
    try {
      let res: Response;

      if (friendshipStatus === 'pending_received' && friendshipId) {
        res = await fetch(`/api/friends/request/${friendshipId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'accept' }),
        });
      } else {
        res = await fetch('/api/friends/request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username }),
        });
      }

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error || 'Request failed');
      }

      const json = await res.json();
      const newStatus = json?.data?.friendship?.status === 'accepted' ? 'accepted' : 'pending_sent';
      const newId = json?.data?.friendship?.id ?? friendshipId;
      onFriendshipChange?.({ status: newStatus, id: newId });
    } catch (err) {
      setFriendError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSendingRequest(false);
    }
  };

  const showFriendButton = !isOwnProfile && isAuthenticated && friendshipStatus != null;

  const igHref = instagramHandle ? `https://instagram.com/${instagramHandle}` : undefined;
  const liHref = linkedinUrl ?? undefined;

  return (
    <div
      style={{
        background: 'var(--surface-container-low)',
        borderRadius: 'var(--radius-lg)',
        padding: isPhone ? '20px' : '24px 28px',
        display: 'flex',
        flexDirection: 'column',
        gap: '18px',
        height: '100%',
        boxSizing: 'border-box',
      }}
    >
      {/* Heading — sentence-case h2 matching the AboutLadder voice. No
          eyebrow. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: '12px',
        }}
      >
        <h2
          style={{
            margin: 0,
            fontFamily: 'var(--font-display)',
            fontSize: '18px',
            fontWeight: 700,
            letterSpacing: '-0.01em',
            color: 'var(--on-surface)',
          }}
        >
          Social
        </h2>
        <span
          style={{
            fontSize: '13px',
            color: 'var(--on-surface-variant)',
            fontWeight: 500,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          <strong style={{ color: 'var(--on-surface)', fontWeight: 700 }}>{friendsCount}</strong>{' '}
          {friendsCount === 1 ? 'friend' : 'friends'}
        </span>
      </div>

      {/* Social link tiles. Both render even when empty — disabled state
          keeps the layout stable. */}
      <div style={{ display: 'flex', gap: '10px' }}>
        <SocialTile
          href={igHref}
          brand="instagram"
          label={instagramHandle ? `Instagram: ${instagramHandle}` : 'Instagram (not linked)'}
          enabled={Boolean(igHref)}
        />
        <SocialTile
          href={liHref}
          brand="linkedin"
          label={linkedinUrl ? 'LinkedIn profile' : 'LinkedIn (not linked)'}
          enabled={Boolean(liHref)}
        />
      </div>

      {/* Friend request button — only on viewers who aren't the profile
          owner. Pushed to the bottom of the flex column. */}
      {showFriendButton && (
        <div style={{ marginTop: 'auto' }}>
          <FriendActionButton
            status={friendshipStatus!}
            sending={sendingRequest}
            onClick={handleFriendRequest}
          />
          {friendError && (
            <p
              role="alert"
              style={{
                fontSize: '12px',
                color: 'var(--error)',
                margin: '8px 0 0',
                textAlign: 'center',
              }}
            >
              {friendError}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Subcomponents
// ───────────────────────────────────────────────────────────────────────────

interface SocialTileProps {
  href: string | undefined;
  brand: 'instagram' | 'linkedin';
  label: string;
  enabled: boolean;
}

// Inline brand SVGs — Material Symbols doesn't have proper Instagram/LinkedIn
// glyphs and the project rule forbids importing icon packages, so we hand-roll
// the path data here.
function BrandIcon({ brand }: { brand: 'instagram' | 'linkedin' }) {
  if (brand === 'instagram') {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        width="20"
        height="20"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24s3.668-.014 4.948-.072c4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z" />
      </svg>
    );
  }
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.063 2.063 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );
}

function SocialTile({ href, brand, label, enabled }: SocialTileProps) {
  return (
    <a
      href={href}
      target={href ? '_blank' : undefined}
      rel={href ? 'noopener noreferrer' : undefined}
      aria-label={label}
      aria-disabled={!enabled}
      title={label}
      className="hl-social-tile"
      data-enabled={enabled ? 'true' : 'false'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '44px',
        height: '44px',
        borderRadius: 'var(--radius-md)',
        background: enabled ? 'var(--brand-purple-wash)' : 'transparent',
        border: enabled
          ? '1px solid var(--brand-purple-edge)'
          : '1px solid var(--outline-variant)',
        color: enabled ? 'var(--brand-purple-strong)' : 'var(--outline)',
        textDecoration: 'none',
        cursor: enabled ? 'pointer' : 'default',
        pointerEvents: enabled ? 'auto' : 'none',
        opacity: enabled ? 1 : 0.55,
        transition:
          'transform var(--dur-fast) var(--ease-spring), background-color var(--dur-fast) var(--ease-spring)',
        flexShrink: 0,
        outline: 'none',
      }}
    >
      <BrandIcon brand={brand} />
      <style>{`
        .hl-social-tile[data-enabled='true']:hover {
          background: var(--brand-purple-hover);
          transform: scale(1.04);
        }
        .hl-social-tile:focus-visible {
          outline: 2px solid var(--color-focus);
          outline-offset: 2px;
        }
        @media (prefers-reduced-motion: reduce) {
          .hl-social-tile { transition: none !important; }
          .hl-social-tile[data-enabled='true']:hover { transform: none; }
        }
      `}</style>
    </a>
  );
}

interface FriendActionButtonProps {
  status: string;
  sending: boolean;
  onClick: () => void;
}

function FriendActionButton({ status, sending, onClick }: FriendActionButtonProps) {
  const baseStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    width: '100%',
    minHeight: '44px',
    padding: '12px 16px',
    borderRadius: 'var(--radius-md)',
    fontSize: '13px',
    fontWeight: 700,
    fontFamily: 'inherit',
    whiteSpace: 'nowrap',
    transition:
      'transform var(--dur-fast) var(--ease-spring), opacity var(--dur-fast) var(--ease-spring), background-color var(--dur-fast) var(--ease-spring)',
  };

  switch (status) {
    case 'none':
      return (
        <button
          type="button"
          onClick={onClick}
          disabled={sending}
          className="hl-friend-btn"
          data-variant="primary"
          style={{
            ...baseStyle,
            background: 'var(--brand-purple-strong)',
            color: 'var(--brand-purple-ink)',
            border: 'none',
            cursor: sending ? 'wait' : 'pointer',
            opacity: sending ? 0.7 : 1,
            outline: 'none',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
            person_add
          </span>
          {sending ? 'Sending…' : 'Add friend'}
          <ButtonStyles />
        </button>
      );

    case 'pending_sent':
      return (
        <div
          style={{
            ...baseStyle,
            background: 'var(--surface-container)',
            color: 'var(--on-surface-variant)',
            border: '1px solid var(--outline-variant)',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
            schedule
          </span>
          Request pending
        </div>
      );

    case 'pending_received':
      return (
        <button
          type="button"
          onClick={onClick}
          disabled={sending}
          className="hl-friend-btn"
          data-variant="success"
          style={{
            ...baseStyle,
            background: 'var(--success)',
            color: 'var(--success-ink)',
            border: 'none',
            cursor: sending ? 'wait' : 'pointer',
            opacity: sending ? 0.7 : 1,
            outline: 'none',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
            how_to_reg
          </span>
          {sending ? 'Accepting…' : 'Accept request'}
          <ButtonStyles />
        </button>
      );

    case 'accepted':
      return (
        <div
          style={{
            ...baseStyle,
            background: 'var(--brand-purple-wash)',
            color: 'var(--brand-purple-strong)',
            border: '1px solid var(--brand-purple-edge)',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
            check_circle
          </span>
          Friends
        </div>
      );

    default:
      return null;
  }
}

// Hover/focus rules emitted once per Friend button render. Inlining the
// <style> here keeps the styling co-located with the JSX without
// needing a global CSS file — same pattern as Switch and SocialTile.
function ButtonStyles() {
  return (
    <style>{`
      .hl-friend-btn:hover:not(:disabled) { transform: scale(1.02); }
      .hl-friend-btn:focus-visible {
        outline: 2px solid var(--color-focus);
        outline-offset: 2px;
      }
      @media (prefers-reduced-motion: reduce) {
        .hl-friend-btn { transition: none !important; }
        .hl-friend-btn:hover { transform: none !important; }
      }
    `}</style>
  );
}
