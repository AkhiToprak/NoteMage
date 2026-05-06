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
 * Socials bento card on the public profile. Shows friends count, optional
 * Instagram/LinkedIn link tiles, and the friend-request action (lifted out
 * of the page header so the header can stay focused on identity).
 *
 * Mutation logic mirrors the previous in-page handler verbatim — the parent
 * still owns `friendshipStatus`/`friendshipId` and receives updates via the
 * `onFriendshipChange` callback so other UI stays in sync.
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
        position: 'relative',
        overflow: 'hidden',
        background: '#21213e',
        borderRadius: isPhone ? 20 : 24,
        padding: isPhone ? '22px 20px' : '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        height: '100%',
        boxSizing: 'border-box',
      }}
    >
      {/* Soft accent gradient — matches the layered surface treatment used
          in the rest of the profile cards. */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(120% 80% at 0% 0%, rgba(174,137,255,0.10) 0%, rgba(174,137,255,0) 55%)',
          pointerEvents: 'none',
        }}
      />

      {/* Header label */}
      <div
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: '16px', color: '#ae89ff' }}>
          group
        </span>
        <span
          style={{
            fontSize: '11px',
            fontWeight: 700,
            color: '#8888a8',
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
          }}
        >
          Social Identity
        </span>
      </div>

      {/* Friends count */}
      <div style={{ position: 'relative' }}>
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: isPhone ? '44px' : '52px',
            fontWeight: 800,
            color: '#e5e3ff',
            lineHeight: 1,
            letterSpacing: '-0.02em',
            margin: 0,
          }}
        >
          {friendsCount}
        </div>
        <div
          style={{
            fontSize: '11px',
            fontWeight: 700,
            color: '#8888a8',
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            marginTop: '8px',
          }}
        >
          {friendsCount === 1 ? 'Friend' : 'Friends'}
        </div>
      </div>

      {/* Social link tiles */}
      <div style={{ position: 'relative', display: 'flex', gap: '10px' }}>
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

      {/* Friend request button */}
      {showFriendButton && (
        <div style={{ position: 'relative', marginTop: 'auto' }}>
          <FriendActionButton
            status={friendshipStatus!}
            sending={sendingRequest}
            onClick={handleFriendRequest}
          />
          {friendError && (
            <p
              style={{
                fontSize: '12px',
                color: '#fd6f85',
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
  const baseStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '44px',
    height: '44px',
    borderRadius: '14px',
    background: enabled ? 'rgba(174,137,255,0.12)' : 'rgba(136,136,168,0.08)',
    border: enabled ? '1px solid rgba(174,137,255,0.28)' : '1px solid rgba(136,136,168,0.18)',
    color: enabled ? '#ae89ff' : '#6a6a8c',
    textDecoration: 'none',
    cursor: enabled ? 'pointer' : 'default',
    pointerEvents: enabled ? 'auto' : 'none',
    opacity: enabled ? 1 : 0.55,
    transition:
      'transform 0.2s cubic-bezier(0.22,1,0.36,1), background 0.2s cubic-bezier(0.22,1,0.36,1)',
    flexShrink: 0,
  };

  return (
    <a
      href={href}
      target={href ? '_blank' : undefined}
      rel={href ? 'noopener noreferrer' : undefined}
      aria-label={label}
      aria-disabled={!enabled}
      title={label}
      style={baseStyle}
      onMouseEnter={(e) => {
        if (!enabled) return;
        const el = e.currentTarget as HTMLAnchorElement;
        el.style.transform = 'scale(1.06)';
        el.style.background = 'rgba(174,137,255,0.2)';
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLAnchorElement;
        el.style.transform = 'scale(1)';
        el.style.background = enabled ? 'rgba(174,137,255,0.12)' : 'rgba(136,136,168,0.08)';
      }}
    >
      <BrandIcon brand={brand} />
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
    borderRadius: '14px',
    fontSize: '13px',
    fontWeight: 700,
    fontFamily: 'inherit',
    transition:
      'transform 0.2s cubic-bezier(0.22,1,0.36,1), opacity 0.2s cubic-bezier(0.22,1,0.36,1), background 0.2s cubic-bezier(0.22,1,0.36,1)',
  };

  switch (status) {
    case 'none':
      return (
        <button
          type="button"
          onClick={onClick}
          disabled={sending}
          style={{
            ...baseStyle,
            background: '#ae89ff',
            color: '#2a0066',
            border: 'none',
            cursor: sending ? 'wait' : 'pointer',
            opacity: sending ? 0.7 : 1,
            boxShadow: '0 8px 24px rgba(174,137,255,0.25)',
          }}
          onMouseEnter={(e) => {
            if (!sending) (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.02)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
            person_add
          </span>
          {sending ? 'Sending…' : 'Send Friend Request'}
        </button>
      );

    case 'pending_sent':
      return (
        <div
          style={{
            ...baseStyle,
            background: 'rgba(136,136,168,0.12)',
            color: '#aaa8c8',
            border: '1px solid rgba(136,136,168,0.22)',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
            schedule
          </span>
          Request Pending
        </div>
      );

    case 'pending_received':
      return (
        <button
          type="button"
          onClick={onClick}
          disabled={sending}
          style={{
            ...baseStyle,
            background: '#4ade80',
            color: '#082b13',
            border: 'none',
            cursor: sending ? 'wait' : 'pointer',
            opacity: sending ? 0.7 : 1,
            boxShadow: '0 8px 24px rgba(74,222,128,0.22)',
          }}
          onMouseEnter={(e) => {
            if (!sending) (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.02)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
            how_to_reg
          </span>
          {sending ? 'Accepting…' : 'Accept Friend Request'}
        </button>
      );

    case 'accepted':
      return (
        <div
          style={{
            ...baseStyle,
            background: 'rgba(78,251,165,0.10)',
            color: '#4efba5',
            border: '1px solid rgba(78,251,165,0.22)',
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
