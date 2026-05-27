'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import ActivityHeatmap from '@/components/features/ActivityHeatmap';
import SocialsCard from '@/components/features/SocialsCard';
import RecentTrophies from '@/components/features/RecentTrophies';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { ProfileHero } from '@/components/profile/ProfileHero';
import { ProfileStatsStrip } from '@/components/profile/ProfileStatsStrip';
import { AboutLadder } from '@/components/profile/AboutLadder';

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
  instagramHandle?: string | null;
  linkedinUrl?: string | null;
  friendsCount?: number;
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

  if (loading) return <LoadingState />;
  if (notFound) return <NotFoundState username={username} />;
  if (!profile) return null;

  const isPrivate = profile.profilePrivate && !isOwnProfile && friendshipStatus !== 'accepted';
  const showAchievements = !profile.hideAchievements && !isPrivate;

  // About ladder rows — bio has moved into the hero, so the ladder
  // carries only the factual fields. Skipping rows with null values
  // keeps the card honest at a glance (no "—" placeholders).
  const aboutRows: { key: string; label: string; value: React.ReactNode }[] = [];
  if (profile.age != null) aboutRows.push({ key: 'age', label: 'Age', value: profile.age });
  if (profile.location) aboutRows.push({ key: 'location', label: 'Location', value: profile.location });
  if (profile.school) aboutRows.push({ key: 'school', label: 'School', value: profile.school });
  if (profile.lineOfWork) aboutRows.push({ key: 'work', label: 'Work', value: profile.lineOfWork });

  return (
    <div
      style={{
        maxWidth: '720px',
        margin: '0 auto',
        padding: isPhone ? '0 16px' : undefined,
        display: 'flex',
        flexDirection: 'column',
        gap: isPhone ? '20px' : '28px',
      }}
    >
      {/* 1. Hero strip — left-biased identity + bio + meta chips. */}
      <ProfileHero
        user={profile}
        action={
          isOwnProfile ? (
            <EditProfileLink isPhone={isPhone} />
          ) : undefined
        }
      />

      {/* Private path: show the lock + Add-friend action and stop. */}
      {isPrivate ? (
        <PrivateNotice
          friendsCount={profile.friendsCount ?? 0}
          friendshipStatus={friendshipStatus}
          friendshipId={friendshipId}
          username={profile.username}
          isAuthenticated={Boolean(session?.user)}
          onFriendshipChange={({ status, id }) => {
            setFriendshipStatus(status);
            setFriendshipId(id);
          }}
        />
      ) : (
        <>
          {/* 2. Stats strip — 3-cell horizontal row: trophies · minutes
              · friends. Replaces the v1 orphan-anchor design that read
              as a layout bug on real viewports. Trophies cell is
              suppressed when the owner has hidden achievements. */}
          <ProfileStatsStrip
            userId={profile.id}
            friendsCount={profile.friendsCount ?? 0}
            hideTrophies={!showAchievements}
          />

          {/* 3. Activity heatmap — elevated card. */}
          <ActivityHeatmap userId={profile.id} weeks={13} subtitle="3 months" />

          {/* 4. Trophy rail — only when achievements are visible. */}
          {showAchievements && <RecentTrophies userId={profile.id} ownerView={isOwnProfile} />}

          {/* 5. Asymmetric bottom row — About left, Social right. Stacks
              on phone. The right column gets the smaller minmax so a
              long school name doesn't push Social off-screen. */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isPhone ? '1fr' : 'minmax(0, 1fr) minmax(0, 1fr)',
              gap: isPhone ? '20px' : '24px',
              alignItems: 'stretch',
            }}
          >
            {aboutRows.length > 0 ? (
              <AboutLadder rows={aboutRows} />
            ) : (
              // When the viewer has no factual rows to show, the row
              // collapses to a single Social column instead of an empty
              // left-half. Keeps the bottom rhythm intact.
              <div />
            )}
            <SocialsCard
              friendsCount={profile.friendsCount ?? 0}
              instagramHandle={profile.instagramHandle ?? null}
              linkedinUrl={profile.linkedinUrl ?? null}
              friendshipStatus={friendshipStatus}
              friendshipId={friendshipId}
              username={profile.username}
              isOwnProfile={isOwnProfile}
              isAuthenticated={Boolean(session?.user)}
              onFriendshipChange={({ status, id }) => {
                setFriendshipStatus(status);
                setFriendshipId(id);
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// State views
// ───────────────────────────────────────────────────────────────────────────

function LoadingState() {
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
        aria-label="Loading profile"
        style={{
          fontSize: '40px',
          color: 'var(--brand-purple-strong)',
          animation: 'spin 1s linear infinite',
        }}
      >
        progress_activity
      </span>
    </div>
  );
}

function NotFoundState({ username }: { username: string }) {
  return (
    <div
      style={{
        textAlign: 'center',
        padding: '64px 24px',
        color: 'var(--on-surface-variant)',
        maxWidth: '420px',
        margin: '0 auto',
      }}
    >
      <span
        className="material-symbols-outlined"
        style={{
          fontSize: '56px',
          display: 'block',
          marginBottom: '16px',
          opacity: 0.4,
        }}
      >
        person_off
      </span>
      <h1
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: '24px',
          fontWeight: 700,
          letterSpacing: '-0.02em',
          color: 'var(--on-surface)',
          margin: '0 0 8px',
        }}
      >
        User not found
      </h1>
      <p style={{ fontSize: '14px', margin: '0 0 24px' }}>
        No account with the username &ldquo;{username}&rdquo; exists.
      </p>
      <Link
        href="/dashboard"
        className="hl-link-btn"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          padding: '10px 24px',
          background: 'var(--brand-purple-wash)',
          color: 'var(--brand-purple-strong)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--brand-purple-edge)',
          fontSize: '14px',
          fontWeight: 600,
          textDecoration: 'none',
          whiteSpace: 'nowrap',
          transition:
            'transform var(--dur-fast) var(--ease-spring), background-color var(--dur-fast) var(--ease-spring)',
          outline: 'none',
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
          home
        </span>
        Go home
      </Link>
      <style>{`
        .hl-link-btn:hover { background: var(--brand-purple-hover); transform: scale(1.02); }
        .hl-link-btn:focus-visible {
          outline: 2px solid var(--color-focus);
          outline-offset: 2px;
        }
        @media (prefers-reduced-motion: reduce) {
          .hl-link-btn { transition: none !important; }
          .hl-link-btn:hover { transform: none; }
        }
      `}</style>
    </div>
  );
}

interface PrivateNoticeProps {
  friendsCount: number;
  friendshipStatus: string | null;
  friendshipId: string | null;
  username: string;
  isAuthenticated: boolean;
  onFriendshipChange: (next: { status: string; id: string | null }) => void;
}

function PrivateNotice({
  friendsCount,
  friendshipStatus,
  friendshipId,
  username,
  isAuthenticated,
  onFriendshipChange,
}: PrivateNoticeProps) {
  return (
    <div
      style={{
        background: 'var(--surface-container-low)',
        borderRadius: 'var(--radius-xl)',
        padding: '36px 28px',
        textAlign: 'center',
      }}
    >
      <span
        className="material-symbols-outlined"
        aria-hidden
        style={{
          fontSize: '40px',
          color: 'var(--on-surface-variant)',
          display: 'block',
          marginBottom: '12px',
          opacity: 0.7,
        }}
      >
        lock
      </span>
      <h2
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: '20px',
          fontWeight: 700,
          letterSpacing: '-0.01em',
          color: 'var(--on-surface)',
          margin: '0 0 6px',
        }}
      >
        Private profile
      </h2>
      <p
        style={{
          fontSize: '14px',
          color: 'var(--on-surface-variant)',
          margin: '0 0 24px',
          maxWidth: '36ch',
          marginInline: 'auto',
        }}
      >
        Only friends can see the full profile. Send a request to unlock it.
      </p>
      <div style={{ maxWidth: '280px', marginInline: 'auto' }}>
        <SocialsCard
          friendsCount={friendsCount}
          instagramHandle={null}
          linkedinUrl={null}
          friendshipStatus={friendshipStatus}
          friendshipId={friendshipId}
          username={username}
          isOwnProfile={false}
          isAuthenticated={isAuthenticated}
          onFriendshipChange={onFriendshipChange}
        />
      </div>
    </div>
  );
}

function EditProfileLink({ isPhone }: { isPhone: boolean }) {
  return (
    <Link
      href="/profile"
      className="hl-link-btn"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        padding: '10px 20px',
        background: 'var(--brand-purple-wash)',
        color: 'var(--brand-purple-strong)',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--brand-purple-edge)',
        fontSize: '14px',
        fontWeight: 600,
        textDecoration: 'none',
        whiteSpace: 'nowrap',
        width: isPhone ? '100%' : 'auto',
        transition:
          'transform var(--dur-fast) var(--ease-spring), background-color var(--dur-fast) var(--ease-spring)',
        outline: 'none',
      }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
        edit
      </span>
      Edit profile
    </Link>
  );
}
