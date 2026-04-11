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
      const newStatus =
        json?.data?.friendship?.status === 'accepted' ? 'accepted' : 'pending_sent';
      const newId = json?.data?.friendship?.id ?? friendshipId;
      onFriendshipChange?.({ status: newStatus, id: newId });
    } catch (err) {
      setFriendError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSendingRequest(false);
    }
  };

  const showFriendButton =
    !isOwnProfile && isAuthenticated && friendshipStatus != null;

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
        <span
          className="material-symbols-outlined"
          style={{ fontSize: '16px', color: '#ae89ff' }}
        >
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
          icon="photo_camera"
          label={instagramHandle ? `Instagram: ${instagramHandle}` : 'Instagram (not linked)'}
          enabled={Boolean(igHref)}
        />
        <SocialTile
          href={liHref}
          icon="work"
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
  icon: string;
  label: string;
  enabled: boolean;
}

function SocialTile({ href, icon, label, enabled }: SocialTileProps) {
  const baseStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '44px',
    height: '44px',
    borderRadius: '14px',
    background: enabled ? 'rgba(174,137,255,0.12)' : 'rgba(136,136,168,0.08)',
    border: enabled
      ? '1px solid rgba(174,137,255,0.28)'
      : '1px solid rgba(136,136,168,0.18)',
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
        el.style.background = enabled
          ? 'rgba(174,137,255,0.12)'
          : 'rgba(136,136,168,0.08)';
      }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
        {icon}
      </span>
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
