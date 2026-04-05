'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface PublicProfileData {
  id: string;
  username: string;
  name: string | null;
  bio: string | null;
  avatarUrl: string | null;
  createdAt: string;
  friendshipStatus: string | null;
  _count: {
    notebooks: number;
  };
}

function getInitials(name?: string | null): string {
  if (!name) return '?';
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export default function PublicProfilePage() {
  const { data: session } = useSession();
  const params = useParams();
  const username = params.username as string;

  const [profile, setProfile] = useState<PublicProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [friendshipStatus, setFriendshipStatus] = useState<string | null>(null);
  const [sendingRequest, setSendingRequest] = useState(false);

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
        } else {
          setNotFound(true);
        }
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [username]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
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
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>home</span>
          Go Home
        </Link>
      </div>
    );
  }

  const handleFriendRequest = async () => {
    if (!profile || sendingRequest) return;
    setSendingRequest(true);
    try {
      const res = await fetch('/api/friends/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: profile.username }),
      });
      if (!res.ok) return;
      const json = await res.json();
      const newStatus = json?.data?.friendship?.status === 'accepted' ? 'accepted' : 'pending_sent';
      setFriendshipStatus(newStatus);
    } catch { /* ignore */ } finally {
      setSendingRequest(false);
    }
  };

  if (!profile) return null;

  return (
    <div style={{ maxWidth: '720px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '32px' }}>
      {/* Profile Header */}
      <div
        style={{
          background: '#161630',
          borderRadius: '24px',
          padding: '40px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
        }}
      >
        {/* Avatar */}
        {profile.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={profile.avatarUrl}
            alt={profile.name || profile.username}
            style={{
              width: '96px',
              height: '96px',
              borderRadius: '50%',
              objectFit: 'cover',
              marginBottom: '16px',
              border: '3px solid rgba(174,137,255,0.3)',
            }}
          />
        ) : (
          <div
            style={{
              width: '96px',
              height: '96px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #ae89ff 0%, #8348f6 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '32px',
              fontWeight: 700,
              color: '#ffffff',
              marginBottom: '16px',
              border: '3px solid rgba(174,137,255,0.3)',
            }}
          >
            {getInitials(profile.name || profile.username)}
          </div>
        )}

        {/* Name & Username */}
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#e5e3ff', margin: '0 0 4px' }}>
          {profile.name || profile.username}
        </h1>
        <p style={{ fontSize: '14px', color: '#aaa8c8', margin: '0 0 12px' }}>
          @{profile.username}
        </p>

        {/* Bio */}
        {profile.bio && (
          <p style={{ fontSize: '14px', color: '#b9c3ff', margin: '0 0 16px', lineHeight: 1.6, maxWidth: '480px' }}>
            {profile.bio}
          </p>
        )}

        {/* Member Since */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#aaa8c8', fontSize: '13px' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>calendar_month</span>
          Member since {formatDate(profile.createdAt)}
        </div>

        {/* Edit Profile (only if own profile) */}
        {isOwnProfile && (
          <Link
            href="/settings"
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
              transition: 'transform 0.2s cubic-bezier(0.22,1,0.36,1), background 0.2s cubic-bezier(0.22,1,0.36,1)',
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
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>edit</span>
            Edit Profile
          </Link>
        )}

        {/* Friend Request Button (only for other users when logged in) */}
        {!isOwnProfile && session?.user && friendshipStatus && (() => {
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
                    opacity: sendingRequest ? 0.7 : 1,
                    transition: 'transform 0.2s cubic-bezier(0.22,1,0.36,1), opacity 0.2s cubic-bezier(0.22,1,0.36,1)',
                  }}
                  onMouseEnter={(e) => { if (!sendingRequest) (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.03)'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'; }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>person_add</span>
                  {sendingRequest ? 'Sending…' : 'Send Friend Request'}
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
                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>schedule</span>
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
                    opacity: sendingRequest ? 0.7 : 1,
                    transition: 'transform 0.2s cubic-bezier(0.22,1,0.36,1), opacity 0.2s cubic-bezier(0.22,1,0.36,1)',
                  }}
                  onMouseEnter={(e) => { if (!sendingRequest) (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.03)'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'; }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>how_to_reg</span>
                  {sendingRequest ? 'Accepting…' : 'Accept Friend Request'}
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
                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>check_circle</span>
                  Friends
                </div>
              );
            default:
              return null;
          }
        })()}
      </div>

      {/* Stats Section */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr',
          gap: '16px',
        }}
      >
        <div
          style={{
            background: '#161630',
            borderRadius: '20px',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '16px',
              background: 'rgba(174,137,255,0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '12px',
            }}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: '24px', color: '#ae89ff' }}
            >
              auto_stories
            </span>
          </div>
          <h3
            style={{
              fontFamily: '"Shrikhand", serif',
              fontStyle: 'italic',
              fontSize: '28px',
              fontWeight: 400,
              color: '#e5e3ff',
              margin: '0 0 4px',
              lineHeight: 1,
            }}
          >
            {profile._count.notebooks}
          </h3>
          <p style={{ fontSize: '13px', fontWeight: 500, color: '#aaa8c8', margin: 0 }}>
            Notebooks
          </p>
        </div>
      </div>
    </div>
  );
}
