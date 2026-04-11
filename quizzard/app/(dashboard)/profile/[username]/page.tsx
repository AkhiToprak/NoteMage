'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import TrophyShelf from '@/components/features/TrophyShelf';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { UserName } from '@/components/user/UserName';
import { UserAvatar } from '@/components/user/UserAvatar';
import { ProfileBackground } from '@/components/cosmetics/ProfileBackground';
import { CosmeticsShowcase } from '@/components/cosmetics/CosmeticsShowcase';
import { COSMETICS } from '@/lib/cosmetics/catalog';

interface PublicProfileData {
  id: string;
  username: string;
  name: string | null;
  bio?: string | null;
  avatarUrl: string | null;
  age?: number | null;
  location?: string | null;
  school?: string | null;
  lineOfWork?: string | null;
  profilePrivate?: boolean;
  hideAchievements?: boolean;
  createdAt: string;
  friendshipStatus: string | null;
  friendshipId: string | null;
  nameStyle?: { fontId?: string; colorId?: string } | null;
  equippedTitleId?: string | null;
  equippedFrameId?: string | null;
  equippedBackgroundId?: string | null;
  /** Admin-only — overrides equippedBackgroundId when set. */
  customBackgroundUrl?: string | null;
  unlockedCosmeticIds?: string[];
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

const DETAIL_ITEMS: { key: keyof PublicProfileData; label: string; icon: string }[] = [
  { key: 'bio', label: 'Description', icon: 'description' },
  { key: 'age', label: 'Age', icon: 'person' },
  { key: 'location', label: 'Location', icon: 'location_on' },
  { key: 'school', label: 'School', icon: 'school' },
  { key: 'lineOfWork', label: 'Line of Work', icon: 'work' },
];

export default function PublicProfilePage() {
  const { data: session } = useSession();
  const { isPhone } = useBreakpoint();
  const params = useParams();
  const username = params.username as string;

  const [profile, setProfile] = useState<PublicProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [friendshipStatus, setFriendshipStatus] = useState<string | null>(null);
  const [friendshipId, setFriendshipId] = useState<string | null>(null);
  const [sendingRequest, setSendingRequest] = useState(false);
  const [friendError, setFriendError] = useState<string | null>(null);

  const isOwnProfile = session?.user?.username === username;

  useEffect(() => {
    fetch(`/api/user/profile/${encodeURIComponent(username)}`)
      .then((r) => {
        if (r.status === 404) {
          setNotFound(true);
          return null;
        }
        return r.json();
      })
      .then((res) => {
        if (!res) return;
        const d = res?.data ?? res;
        if (d?.id) {
          setProfile(d);
          setFriendshipStatus(d.friendshipStatus ?? null);
          setFriendshipId(d.friendshipId ?? null);
        } else {
          setNotFound(true);
        }
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [username]);

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '400px',
        }}
      >
        <span
          className="material-symbols-outlined"
          style={{ fontSize: '48px', color: '#ae89ff', animation: 'spin 1s linear infinite' }}
        >
          progress_activity
        </span>
      </div>
    );
  }

  if (notFound) {
    return (
      <div style={{ textAlign: 'center', padding: '64px 24px', color: '#aaa8c8' }}>
        <span
          className="material-symbols-outlined"
          style={{ fontSize: '64px', display: 'block', marginBottom: '16px', opacity: 0.4 }}
        >
          person_off
        </span>
        <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#e5e3ff', margin: '0 0 8px' }}>
          User Not Found
        </h2>
        <p style={{ fontSize: '14px', margin: '0 0 24px' }}>
          No user with the username &quot;{username}&quot; exists.
        </p>
        <Link
          href="/home"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 24px',
            background: 'rgba(174,137,255,0.15)',
            color: '#ae89ff',
            borderRadius: '12px',
            border: '1px solid rgba(174,137,255,0.25)',
            fontSize: '14px',
            fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
            home
          </span>
          Go Home
        </Link>
      </div>
    );
  }

  const handleFriendRequest = async () => {
    if (!profile || sendingRequest) return;
    setSendingRequest(true);
    setFriendError(null);
    try {
      let res: Response;

      if (friendshipStatus === 'pending_received' && friendshipId) {
        // Use the direct PUT path (same as FriendsList) for reliable accept
        res = await fetch(`/api/friends/request/${friendshipId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'accept' }),
        });
      } else {
        // Send new request (or auto-accept via POST)
        res = await fetch('/api/friends/request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: profile.username }),
        });
      }

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error || 'Request failed');
      }

      const json = await res.json();
      const newStatus = json?.data?.friendship?.status === 'accepted' ? 'accepted' : 'pending_sent';
      setFriendshipStatus(newStatus);
      setFriendshipId(json?.data?.friendship?.id ?? friendshipId);
    } catch (err) {
      setFriendError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSendingRequest(false);
    }
  };

  if (!profile) return null;

  const isPrivate = profile.profilePrivate && !isOwnProfile && friendshipStatus !== 'accepted';
  const hasDetails = DETAIL_ITEMS.some((item) => profile[item.key] != null);
  const showAchievements = !profile.hideAchievements && !isPrivate;
  const headerRadius = isPhone ? 20 : 24;
  const hasFrame = Boolean(
    profile.equippedFrameId &&
      COSMETICS[profile.equippedFrameId]?.type === 'frame' &&
      (COSMETICS[profile.equippedFrameId] as { component?: string })?.component !==
        'none'
  );

  return (
    <div
      style={{
        maxWidth: '720px',
        margin: '0 auto',
        padding: isPhone ? '0 16px' : undefined,
        display: 'flex',
        flexDirection: 'column',
        gap: isPhone ? '24px' : '32px',
      }}
    >
      {/* Profile Header */}
      <div
        style={{
          position: 'relative',
          overflow: 'hidden',
          background: '#21213e',
          borderRadius: headerRadius,
          padding: isPhone ? '28px 20px' : '40px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
        }}
      >
        <ProfileBackground
          backgroundId={profile.equippedBackgroundId}
          customBackgroundUrl={profile.customBackgroundUrl}
          radius={headerRadius}
        />
        {/* Avatar */}
        <div style={{ marginBottom: '16px', position: 'relative', zIndex: 1 }}>
          <UserAvatar
            user={profile}
            size={isPhone ? 80 : 96}
            radius="50%"
            style={
              hasFrame ? undefined : { border: '3px solid rgba(174,137,255,0.3)' }
            }
          />
        </div>

        {/* Name & Username */}
        <UserName
          user={profile}
          as="div"
          showTitle
          style={{
            fontSize: isPhone ? 20 : 24,
            fontWeight: 700,
            color: '#e5e3ff',
            marginBottom: 4,
            justifyContent: 'center',
          }}
        />
        <p style={{ fontSize: isPhone ? '13px' : '14px', color: '#aaa8c8', margin: '0 0 12px' }}>
          @{profile.username}
        </p>

        {/* Member Since */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            color: '#aaa8c8',
            fontSize: '13px',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
            calendar_month
          </span>
          Member since {formatDate(profile.createdAt)}
        </div>

        {/* Edit Profile (only if own profile) */}
        {isOwnProfile && (
          <Link
            href="/profile"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              marginTop: '20px',
              padding: '10px 24px',
              background: 'rgba(174,137,255,0.15)',
              color: '#ae89ff',
              borderRadius: '12px',
              border: '1px solid rgba(174,137,255,0.25)',
              fontSize: '14px',
              fontWeight: 600,
              textDecoration: 'none',
              cursor: 'pointer',
              transition:
                'transform 0.2s cubic-bezier(0.22,1,0.36,1), background 0.2s cubic-bezier(0.22,1,0.36,1)',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(174,137,255,0.25)';
              (e.currentTarget as HTMLAnchorElement).style.transform = 'scale(1.03)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(174,137,255,0.15)';
              (e.currentTarget as HTMLAnchorElement).style.transform = 'scale(1)';
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
              edit
            </span>
            Edit Profile
          </Link>
        )}

        {/* Friend Request Button (only for other users when logged in) */}
        {!isOwnProfile &&
          session?.user &&
          friendshipStatus &&
          (() => {
            switch (friendshipStatus) {
              case 'none':
                return (
                  <button
                    onClick={handleFriendRequest}
                    disabled={sendingRequest}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      marginTop: '20px',
                      padding: '10px 24px',
                      background: '#ae89ff',
                      color: '#2a0066',
                      borderRadius: '12px',
                      border: 'none',
                      fontSize: '14px',
                      fontWeight: 600,
                      cursor: sendingRequest ? 'wait' : 'pointer',
                      fontFamily: 'inherit',
                      opacity: sendingRequest ? 0.7 : 1,
                      transition:
                        'transform 0.2s cubic-bezier(0.22,1,0.36,1), opacity 0.2s cubic-bezier(0.22,1,0.36,1)',
                    }}
                    onMouseEnter={(e) => {
                      if (!sendingRequest)
                        (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.03)';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
                      person_add
                    </span>
                    {sendingRequest ? 'Sending...' : 'Send Friend Request'}
                  </button>
                );
              case 'pending_sent':
                return (
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      marginTop: '20px',
                      padding: '10px 24px',
                      background: 'rgba(136,136,168,0.15)',
                      color: '#8888a8',
                      borderRadius: '12px',
                      border: '1px solid rgba(136,136,168,0.25)',
                      fontSize: '14px',
                      fontWeight: 600,
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
                    onClick={handleFriendRequest}
                    disabled={sendingRequest}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      marginTop: '20px',
                      padding: '10px 24px',
                      background: '#4ade80',
                      color: '#000',
                      borderRadius: '12px',
                      border: 'none',
                      fontSize: '14px',
                      fontWeight: 600,
                      cursor: sendingRequest ? 'wait' : 'pointer',
                      fontFamily: 'inherit',
                      opacity: sendingRequest ? 0.7 : 1,
                      transition:
                        'transform 0.2s cubic-bezier(0.22,1,0.36,1), opacity 0.2s cubic-bezier(0.22,1,0.36,1)',
                    }}
                    onMouseEnter={(e) => {
                      if (!sendingRequest)
                        (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.03)';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
                      how_to_reg
                    </span>
                    {sendingRequest ? 'Accepting...' : 'Accept Friend Request'}
                  </button>
                );
              case 'accepted':
                return (
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      marginTop: '20px',
                      padding: '10px 24px',
                      background: 'rgba(78,251,165,0.1)',
                      color: '#4efba5',
                      borderRadius: '12px',
                      border: '1px solid rgba(78,251,165,0.2)',
                      fontSize: '14px',
                      fontWeight: 600,
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
          })()}

        {friendError && (
          <p style={{ fontSize: '13px', color: '#fd6f85', marginTop: '8px', margin: '8px 0 0' }}>
            {friendError}
          </p>
        )}
      </div>

      {/* Private Profile Notice */}
      {isPrivate && (
        <div
          style={{
            background: '#21213e',
            borderRadius: isPhone ? '20px' : '24px',
            padding: isPhone ? '28px 20px' : '40px',
            textAlign: 'center',
          }}
        >
          <span
            className="material-symbols-outlined"
            style={{
              fontSize: '48px',
              color: '#8888a8',
              display: 'block',
              marginBottom: '12px',
              opacity: 0.5,
            }}
          >
            lock
          </span>
          <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#e5e3ff', margin: '0 0 8px' }}>
            This profile is private
          </h3>
          <p style={{ fontSize: '13px', color: '#8888a8', margin: 0 }}>
            Only friends can see the full profile.
          </p>
        </div>
      )}

      {/* Profile Details (only if not private and has details) */}
      {!isPrivate && hasDetails && (
        <div
          style={{
            background: '#21213e',
            borderRadius: isPhone ? '20px' : '24px',
            padding: isPhone ? '20px' : '28px 32px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#e5e3ff', margin: 0 }}>About</h3>
          {DETAIL_ITEMS.map((item) => {
            const value = profile[item.key];
            if (value == null) return null;
            return (
              <div key={item.key} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: '20px', color: '#ae89ff', flexShrink: 0 }}
                >
                  {item.icon}
                </span>
                <div>
                  <p
                    style={{
                      fontSize: '11px',
                      color: '#8888a8',
                      margin: '0 0 2px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      fontWeight: 600,
                    }}
                  >
                    {item.label}
                  </p>
                  <p style={{ fontSize: '14px', color: '#e5e3ff', margin: 0 }}>{String(value)}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Cosmetics Showcase — only when not private and there's something
          beyond the level-1 defaults to show. The component itself renders
          nothing when the filtered list is empty, so we can safely mount it
          and rely on its internal guard. */}
      {!isPrivate && profile.unlockedCosmeticIds && (
        <CosmeticsShowcase
          unlockedIds={profile.unlockedCosmeticIds}
          isPhone={isPhone}
        />
      )}

      {/* Achievements */}
      {showAchievements && <TrophyShelf userId={profile.id} />}
    </div>
  );
}
