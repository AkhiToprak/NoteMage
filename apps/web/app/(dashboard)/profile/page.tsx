'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState, useRef, useCallback } from 'react';
import AvatarEditor from '@/components/ui/AvatarEditor';
import ActivityHeatmap from '@/components/features/ActivityHeatmap';
import SocialsCard from '@/components/features/SocialsCard';
import RecentTrophies from '@/components/features/RecentTrophies';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { UserName } from '@/components/user/UserName';
import { UserAvatar } from '@/components/user/UserAvatar';
import { CosmeticsPanel, type CosmeticsSelection } from '@/components/cosmetics/CosmeticsPanel';
import { ProfileBackground } from '@/components/cosmetics/ProfileBackground';

const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,20}$/;
type UsernameStatus = 'idle' | 'typing' | 'checking' | 'available' | 'taken' | 'invalid';

interface ProfileData {
  id: string;
  username: string;
  name: string | null;
  bio: string | null;
  avatarUrl: string | null;
  dailyGoal: number;
  age: number | null;
  location: string | null;
  school: string | null;
  lineOfWork: string | null;
  instagramHandle: string | null;
  linkedinUrl: string | null;
  profilePrivate: boolean;
  hideAchievements: boolean;
  createdAt: string;
  nameStyle: { fontId?: string; colorId?: string } | null;
  equippedTitleId: string | null;
  equippedFrameId: string | null;
  equippedBackgroundId: string | null;
  // Admin-only fields. `customBackgroundUrl` overrides `equippedBackgroundId`
  // when set; `role` gates the admin-only upload UI in <CosmeticsPanel>.
  customBackgroundUrl: string | null;
  role: string;
}

interface FormState {
  name: string;
  bio: string;
  age: string;
  location: string;
  school: string;
  lineOfWork: string;
  instagramHandle: string;
  linkedinUrl: string;
  profilePrivate: boolean;
  hideAchievements: boolean;
}

const EMPTY_COSMETICS: CosmeticsSelection = {
  equippedTitleId: null,
  fontId: null,
  colorId: null,
  equippedFrameId: null,
  equippedBackgroundId: null,
  customBackgroundUrl: null,
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

const INPUT_STYLE: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  background: '#272746',
  border: '1px solid rgba(170,168,200,0.2)',
  borderRadius: '10px',
  color: '#e5e3ff',
  fontSize: '14px',
  fontFamily: 'inherit',
  outline: 'none',
  transition: 'border-color 0.2s cubic-bezier(0.22,1,0.36,1)',
};

const LABEL_STYLE: React.CSSProperties = {
  fontSize: '12px',
  fontWeight: 600,
  color: '#8888a8',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  marginBottom: '6px',
  display: 'block',
};

const DETAIL_ITEMS: { key: keyof ProfileData; label: string; icon: string }[] = [
  { key: 'bio', label: 'Description', icon: 'description' },
  { key: 'age', label: 'Age', icon: 'person' },
  { key: 'location', label: 'Location', icon: 'location_on' },
  { key: 'school', label: 'School', icon: 'school' },
  { key: 'lineOfWork', label: 'Line of Work', icon: 'work' },
];

export default function ProfilePage() {
  const { data: session, update: updateSession } = useSession();
  const { isPhone } = useBreakpoint();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({
    name: '',
    bio: '',
    age: '',
    location: '',
    school: '',
    lineOfWork: '',
    instagramHandle: '',
    linkedinUrl: '',
    profilePrivate: false,
    hideAchievements: false,
  });
  const [cosmeticsForm, setCosmeticsForm] = useState<CosmeticsSelection>(EMPTY_COSMETICS);
  // Independent save state for the always-visible Appearance card so it
  // can be edited without having to also enter the About edit mode.
  const [cosmeticsDirty, setCosmeticsDirty] = useState(false);
  const [cosmeticsSaving, setCosmeticsSaving] = useState(false);
  const [cosmeticsFeedback, setCosmeticsFeedback] = useState<{
    kind: 'saved' | 'error';
    message: string;
  } | null>(null);
  // Appearance card is collapsed by default so it doesn't push the page
  // height on first visit. Auto-expands when the user has pending changes
  // to ensure the Save button is reachable.
  const [appearanceOpen, setAppearanceOpen] = useState(false);

  // Mage level (computed from XP)
  const [mageLevel, setMageLevel] = useState<number | null>(null);

  // Friends count for the Socials bento card. The /api/user/profile (own)
  // endpoint doesn't return this, so we hit /api/friends?status=accepted
  // separately and use its `count` field.
  const [friendsCount, setFriendsCount] = useState<number>(0);

  // Edit profile modal state
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [avatarEditorOpen, setAvatarEditorOpen] = useState(false);
  const [usernameInput, setUsernameInput] = useState('');
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>('idle');
  const [usernameMessage, setUsernameMessage] = useState('');
  const [modalSaving, setModalSaving] = useState(false);
  const [modalError, setModalError] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch('/api/user/profile')
      .then((r) => r.json())
      .then((res) => {
        const d = res?.data ?? res;
        if (d?.id) {
          setProfile(d);
          // Seed the standalone Appearance card with whatever the user is
          // currently wearing so the panel renders with the right
          // selections highlighted on first paint.
          setCosmeticsForm({
            equippedTitleId: d.equippedTitleId ?? null,
            fontId: d.nameStyle?.fontId ?? null,
            colorId: d.nameStyle?.colorId ?? null,
            equippedFrameId: d.equippedFrameId ?? null,
            equippedBackgroundId: d.equippedBackgroundId ?? null,
            customBackgroundUrl: d.customBackgroundUrl ?? null,
          });
          setCosmeticsDirty(false);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    fetch('/api/user/xp')
      .then((r) => r.json())
      .then((res) => {
        const d = res?.data ?? res;
        if (d?.level !== undefined) setMageLevel(d.level);
      })
      .catch(() => {});

    fetch('/api/friends?status=accepted')
      .then((r) => r.json())
      .then((res) => {
        const d = res?.data ?? res;
        if (typeof d?.count === 'number') setFriendsCount(d.count);
      })
      .catch(() => {});
  }, []);

  const startEditing = () => {
    if (!profile) return;
    setForm({
      name: profile.name || '',
      bio: profile.bio || '',
      age: profile.age != null ? String(profile.age) : '',
      location: profile.location || '',
      school: profile.school || '',
      lineOfWork: profile.lineOfWork || '',
      instagramHandle: profile.instagramHandle || '',
      linkedinUrl: profile.linkedinUrl || '',
      profilePrivate: profile.profilePrivate,
      hideAchievements: profile.hideAchievements,
    });
    // cosmeticsForm lives in the always-visible Appearance card and is
    // seeded from profile on mount — no need to re-seed here, and doing
    // so would blow away any pending cosmetic selections.
    setEditing(true);
  };

  // Username availability check
  const checkUsername = useCallback(
    async (value: string) => {
      const normalized = value.toLowerCase();
      if (!USERNAME_REGEX.test(normalized)) {
        setUsernameStatus('invalid');
        setUsernameMessage('3–20 chars, letters, numbers, underscores');
        return;
      }
      if (profile && normalized === profile.username) {
        setUsernameStatus('idle');
        setUsernameMessage('');
        return;
      }
      setUsernameStatus('checking');
      setUsernameMessage('');
      try {
        const res = await fetch(
          `/api/user/check-username?username=${encodeURIComponent(normalized)}`
        );
        const json = await res.json();
        if (json.data?.available) {
          setUsernameStatus('available');
          setUsernameMessage('Username is available');
        } else {
          setUsernameStatus('taken');
          setUsernameMessage('Username is already taken');
        }
      } catch {
        setUsernameStatus('idle');
        setUsernameMessage('');
      }
    },
    [profile]
  );

  const handleUsernameChange = (value: string) => {
    setUsernameInput(value);
    setUsernameStatus('typing');
    setUsernameMessage('');
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.length >= 3) {
      debounceRef.current = setTimeout(() => checkUsername(value), 500);
    }
  };

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const openEditModal = () => {
    if (!profile) return;
    setUsernameInput(profile.username);
    setUsernameStatus('idle');
    setUsernameMessage('');
    setModalError('');
    setEditModalOpen(true);
  };

  const handleModalSave = async () => {
    if (!profile) return;
    const normalized = usernameInput.trim().toLowerCase();

    if (!USERNAME_REGEX.test(normalized)) {
      setModalError('Username must be 3–20 characters: letters, numbers, underscores only');
      return;
    }
    if (usernameStatus === 'taken') {
      setModalError('That username is already taken');
      return;
    }
    if (usernameStatus === 'checking') {
      setModalError('Please wait while we check username availability');
      return;
    }

    if (normalized === profile.username) {
      setEditModalOpen(false);
      return;
    }

    setModalSaving(true);
    setModalError('');
    try {
      const res = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: normalized }),
      });
      if (res.ok) {
        const json = await res.json();
        setProfile(json.data ?? json);
        await updateSession();
        setEditModalOpen(false);
      } else {
        const json = await res.json();
        setModalError(json.error || 'Save failed');
      }
    } catch {
      setModalError('Save failed. Please try again.');
    } finally {
      setModalSaving(false);
    }
  };

  // Appearance card has its own save path — it's always visible (not
  // gated on `editing`) so users can tweak cosmetics without touching
  // their About details. PUT sends only cosmetic fields so we don't
  // accidentally clobber anything else.
  const handleCosmeticsChange = (next: CosmeticsSelection) => {
    setCosmeticsForm(next);
    setCosmeticsDirty(true);
    setCosmeticsFeedback(null);
  };

  const handleSaveCosmetics = async () => {
    if (cosmeticsSaving) return;
    setCosmeticsSaving(true);
    setCosmeticsFeedback(null);
    try {
      const hasNameStyle = cosmeticsForm.fontId != null || cosmeticsForm.colorId != null;
      const nameStylePayload = hasNameStyle
        ? {
            fontId: cosmeticsForm.fontId ?? undefined,
            colorId: cosmeticsForm.colorId ?? undefined,
          }
        : null;

      const res = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nameStyle: nameStylePayload,
          equippedTitleId: cosmeticsForm.equippedTitleId,
          equippedFrameId: cosmeticsForm.equippedFrameId,
          equippedBackgroundId: cosmeticsForm.equippedBackgroundId,
          // Only admin accounts are allowed to write customBackgroundUrl
          // (the API rejects the field otherwise). Omit the key entirely
          // for regular users so their saves stay clean.
          ...(profile?.role === 'admin'
            ? { customBackgroundUrl: cosmeticsForm.customBackgroundUrl }
            : {}),
        }),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error || 'Save failed');
      }
      const json = await res.json();
      const updated = json?.data ?? json;
      setProfile(updated);
      await updateSession();
      setCosmeticsDirty(false);
      setCosmeticsFeedback({ kind: 'saved', message: 'Appearance saved' });
    } catch (err) {
      setCosmeticsFeedback({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Save failed',
      });
    } finally {
      setCosmeticsSaving(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      // Cosmetics: collapse font/color into a single `nameStyle` object (or
      // null when both are unset) to match the profile PUT contract.
      const hasNameStyle = cosmeticsForm.fontId != null || cosmeticsForm.colorId != null;
      const nameStylePayload = hasNameStyle
        ? {
            fontId: cosmeticsForm.fontId ?? undefined,
            colorId: cosmeticsForm.colorId ?? undefined,
          }
        : null;

      const res = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name || null,
          bio: form.bio || null,
          age: form.age ? parseInt(form.age, 10) : null,
          location: form.location || null,
          school: form.school || null,
          lineOfWork: form.lineOfWork || null,
          instagramHandle: form.instagramHandle.trim() || null,
          linkedinUrl: form.linkedinUrl.trim() || null,
          profilePrivate: form.profilePrivate,
          hideAchievements: form.hideAchievements,
          nameStyle: nameStylePayload,
          equippedTitleId: cosmeticsForm.equippedTitleId,
          equippedFrameId: cosmeticsForm.equippedFrameId,
          equippedBackgroundId: cosmeticsForm.equippedBackgroundId,
          ...(profile?.role === 'admin'
            ? { customBackgroundUrl: cosmeticsForm.customBackgroundUrl }
            : {}),
        }),
      });
      if (res.ok) {
        const json = await res.json();
        const updated = json?.data ?? json;
        setProfile(updated);
        // Keep the session cookie's cached user in sync so every
        // <UserName>/<UserAvatar> surface across the app re-paints.
        await updateSession();
        setEditing(false);
      } else {
        // Surface the server's reason instead of silently dropping. This used
        // to be a `catch {}` no-op which made every 4xx look like "save just
        // didn't do anything" — impossible to debug without devtools open.
        const errJson = await res.json().catch(() => null);
        setSaveError(errJson?.error || `Save failed (${res.status} ${res.statusText})`);
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

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

  if (!profile) {
    return (
      <div style={{ textAlign: 'center', padding: '64px 24px', color: '#aaa8c8' }}>
        <span
          className="material-symbols-outlined"
          style={{ fontSize: '48px', display: 'block', marginBottom: '16px', opacity: 0.4 }}
        >
          error
        </span>
        <p style={{ fontSize: '16px', margin: 0 }}>Could not load profile.</p>
      </div>
    );
  }

  const hasDetails = DETAIL_ITEMS.some((item) => profile[item.key] != null);

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
          background: '#21213e',
          borderRadius: isPhone ? '20px' : '24px',
          padding: isPhone ? '28px 20px' : '40px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          overflow: 'hidden',
        }}
      >
        {/* Equipped background layer — sits behind the content. Default /
            unset renders nothing and the flat #21213e shows through. */}
        <ProfileBackground
          backgroundId={profile.equippedBackgroundId}
          customBackgroundUrl={profile.customBackgroundUrl}
          radius={isPhone ? 20 : 24}
        />

        {/* Avatar */}
        <div
          style={{
            position: 'relative',
            zIndex: 1,
            marginBottom: '16px',
          }}
        >
          <UserAvatar
            user={profile}
            size={isPhone ? 80 : 96}
            radius="50%"
            style={{
              border: profile.equippedFrameId ? 'none' : '3px solid rgba(174,137,255,0.3)',
            }}
          />
        </div>

        {/* Name & Title */}
        <div style={{ position: 'relative', zIndex: 1 }}>
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
        </div>
        <p
          style={{
            position: 'relative',
            zIndex: 1,
            fontSize: isPhone ? '13px' : '14px',
            color: '#aaa8c8',
            margin: '0 0 12px',
          }}
        >
          @{profile.username}
        </p>

        {/* Mage Level */}
        <div
          style={{
            position: 'relative',
            zIndex: 1,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 12px',
            background: 'rgba(174,137,255,0.12)',
            border: '1px solid rgba(174,137,255,0.3)',
            borderRadius: '20px',
            marginBottom: '12px',
          }}
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: '14px', color: '#ae89ff' }}
          >
            auto_awesome
          </span>
          <span style={{ fontSize: '12px', fontWeight: 700, color: '#ae89ff' }}>
            Mage Level {mageLevel ?? '—'}
          </span>
        </div>

        {/* Member Since */}
        <div
          style={{
            position: 'relative',
            zIndex: 1,
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

        {/* Privacy badges */}
        <div
          style={{
            position: 'relative',
            zIndex: 1,
            display: 'flex',
            gap: '8px',
            marginTop: '12px',
            flexWrap: 'wrap',
            justifyContent: 'center',
          }}
        >
          {profile.profilePrivate && (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 12px',
                background: 'rgba(136,136,168,0.12)',
                borderRadius: '20px',
                fontSize: '12px',
                fontWeight: 600,
                color: '#8888a8',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>
                lock
              </span>
              Private Profile
            </div>
          )}
          {profile.hideAchievements && (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 12px',
                background: 'rgba(136,136,168,0.12)',
                borderRadius: '20px',
                fontSize: '12px',
                fontWeight: 600,
                color: '#8888a8',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>
                visibility_off
              </span>
              Achievements Hidden
            </div>
          )}
        </div>

        {/* Edit Profile Button */}
        <button
          onClick={openEditModal}
          style={{
            position: 'relative',
            zIndex: 1,
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
            cursor: 'pointer',
            fontFamily: 'inherit',
            transition:
              'transform 0.2s cubic-bezier(0.22,1,0.36,1), background 0.2s cubic-bezier(0.22,1,0.36,1)',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(174,137,255,0.25)';
            (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.03)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(174,137,255,0.15)';
            (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
            edit
          </span>
          Edit Profile
        </button>
      </div>

      {/* Profile Details (view mode) */}
      {!editing && hasDetails && (
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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#e5e3ff', margin: 0 }}>
              About
            </h3>
            <button
              onClick={startEditing}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 12px',
                background: 'transparent',
                color: '#ae89ff',
                borderRadius: '8px',
                border: '1px solid rgba(174,137,255,0.2)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'background 0.2s cubic-bezier(0.22,1,0.36,1)',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(174,137,255,0.1)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>
                edit
              </span>
              Edit
            </button>
          </div>
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

      {/* Edit Form */}
      {editing && (
        <div
          style={{
            background: '#21213e',
            borderRadius: isPhone ? '20px' : '24px',
            padding: isPhone ? '20px' : '32px',
            display: 'flex',
            flexDirection: 'column',
            gap: isPhone ? '16px' : '20px',
          }}
        >
          <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#e5e3ff', margin: 0 }}>
            Edit Profile
          </h3>

          {/* Name */}
          <div>
            <label style={LABEL_STYLE}>Full Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              maxLength={100}
              placeholder="Your full name"
              style={INPUT_STYLE}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = 'rgba(174,137,255,0.5)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'rgba(170,168,200,0.2)';
              }}
            />
          </div>

          {/* Bio */}
          <div>
            <label style={LABEL_STYLE}>Bio</label>
            <textarea
              value={form.bio}
              onChange={(e) => setForm({ ...form, bio: e.target.value })}
              maxLength={160}
              placeholder="Write a short description about yourself"
              rows={3}
              style={{
                ...INPUT_STYLE,
                resize: 'vertical',
                minHeight: '72px',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = 'rgba(174,137,255,0.5)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'rgba(170,168,200,0.2)';
              }}
            />
            <p
              style={{ fontSize: '11px', color: '#6a6a8c', margin: '4px 0 0', textAlign: 'right' }}
            >
              {form.bio.length}/160
            </p>
          </div>

          {/* Two-column grid for short fields */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isPhone ? '1fr' : '1fr 1fr',
              gap: '16px',
            }}
          >
            <div>
              <label style={LABEL_STYLE}>Age</label>
              <input
                type="number"
                value={form.age}
                onChange={(e) => setForm({ ...form, age: e.target.value })}
                min={1}
                max={150}
                placeholder="Your age"
                style={INPUT_STYLE}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(174,137,255,0.5)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(170,168,200,0.2)';
                }}
              />
            </div>
            <div>
              <label style={LABEL_STYLE}>Location</label>
              <input
                type="text"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                maxLength={100}
                placeholder="City, Country"
                style={INPUT_STYLE}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(174,137,255,0.5)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(170,168,200,0.2)';
                }}
              />
            </div>
            <div>
              <label style={LABEL_STYLE}>School</label>
              <input
                type="text"
                value={form.school}
                onChange={(e) => setForm({ ...form, school: e.target.value })}
                maxLength={100}
                placeholder="Your school or university"
                style={INPUT_STYLE}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(174,137,255,0.5)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(170,168,200,0.2)';
                }}
              />
            </div>
            <div>
              <label style={LABEL_STYLE}>Line of Work</label>
              <input
                type="text"
                value={form.lineOfWork}
                onChange={(e) => setForm({ ...form, lineOfWork: e.target.value })}
                maxLength={100}
                placeholder="Your profession"
                style={INPUT_STYLE}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(174,137,255,0.5)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(170,168,200,0.2)';
                }}
              />
            </div>
            <div>
              <label style={LABEL_STYLE}>Instagram</label>
              <input
                type="text"
                value={form.instagramHandle}
                onChange={(e) => setForm({ ...form, instagramHandle: e.target.value })}
                maxLength={30}
                placeholder="yourhandle"
                style={INPUT_STYLE}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(174,137,255,0.5)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(170,168,200,0.2)';
                }}
              />
            </div>
            <div>
              <label style={LABEL_STYLE}>LinkedIn</label>
              <input
                type="url"
                value={form.linkedinUrl}
                onChange={(e) => setForm({ ...form, linkedinUrl: e.target.value })}
                maxLength={200}
                placeholder="https://www.linkedin.com/in/you"
                style={INPUT_STYLE}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(174,137,255,0.5)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(170,168,200,0.2)';
                }}
              />
            </div>
          </div>

          {/* Privacy Toggles */}
          <div style={{ borderTop: '1px solid rgba(170,168,200,0.1)', paddingTop: '20px' }}>
            <h4 style={{ fontSize: '13px', fontWeight: 700, color: '#e5e3ff', margin: '0 0 16px' }}>
              Privacy
            </h4>

            {/* Private Profile Toggle */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                background: '#272746',
                borderRadius: '12px',
                marginBottom: '10px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: '20px', color: '#ae89ff' }}
                >
                  lock
                </span>
                <div>
                  <p style={{ fontSize: '13px', fontWeight: 600, color: '#e5e3ff', margin: 0 }}>
                    Private Profile
                  </p>
                  <p style={{ fontSize: '11px', color: '#8888a8', margin: '2px 0 0' }}>
                    Only friends can see your full profile
                  </p>
                </div>
              </div>
              <button
                onClick={() => setForm({ ...form, profilePrivate: !form.profilePrivate })}
                style={{
                  width: '44px',
                  height: '24px',
                  borderRadius: '12px',
                  border: 'none',
                  cursor: 'pointer',
                  position: 'relative',
                  background: form.profilePrivate ? '#ae89ff' : '#3a3a5c',
                  transition: 'background 0.2s cubic-bezier(0.22,1,0.36,1)',
                }}
              >
                <div
                  style={{
                    width: '18px',
                    height: '18px',
                    borderRadius: '50%',
                    background: '#fff',
                    position: 'absolute',
                    top: '3px',
                    left: form.profilePrivate ? '23px' : '3px',
                    transition: 'left 0.2s cubic-bezier(0.22,1,0.36,1)',
                  }}
                />
              </button>
            </div>

            {/* Hide Achievements Toggle */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                background: '#272746',
                borderRadius: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: '20px', color: '#ae89ff' }}
                >
                  visibility_off
                </span>
                <div>
                  <p style={{ fontSize: '13px', fontWeight: 600, color: '#e5e3ff', margin: 0 }}>
                    Hide Achievements
                  </p>
                  <p style={{ fontSize: '11px', color: '#8888a8', margin: '2px 0 0' }}>
                    Others cannot see your achievements
                  </p>
                </div>
              </div>
              <button
                onClick={() => setForm({ ...form, hideAchievements: !form.hideAchievements })}
                style={{
                  width: '44px',
                  height: '24px',
                  borderRadius: '12px',
                  border: 'none',
                  cursor: 'pointer',
                  position: 'relative',
                  background: form.hideAchievements ? '#ae89ff' : '#3a3a5c',
                  transition: 'background 0.2s cubic-bezier(0.22,1,0.36,1)',
                }}
              >
                <div
                  style={{
                    width: '18px',
                    height: '18px',
                    borderRadius: '50%',
                    background: '#fff',
                    position: 'absolute',
                    top: '3px',
                    left: form.hideAchievements ? '23px' : '3px',
                    transition: 'left 0.2s cubic-bezier(0.22,1,0.36,1)',
                  }}
                />
              </button>
            </div>
          </div>

          {/* Save error — surfaced inline so failed saves stop looking like
              silent no-ops. Server reasons (validation, 500s) all land here. */}
          {saveError && (
            <div
              role="alert"
              style={{
                background: 'rgba(253,111,133,0.10)',
                border: '1px solid rgba(253,111,133,0.30)',
                color: '#fd6f85',
                borderRadius: '12px',
                padding: '12px 16px',
                fontSize: '13px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
                error
              </span>
              {saveError}
            </div>
          )}

          {/* Save / Cancel */}
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <button
              onClick={() => setEditing(false)}
              disabled={saving}
              style={{
                padding: '10px 24px',
                background: 'transparent',
                color: '#aaa8c8',
                borderRadius: '12px',
                border: '1px solid rgba(170,168,200,0.2)',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'background 0.2s cubic-bezier(0.22,1,0.36,1)',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(170,168,200,0.08)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                padding: '10px 24px',
                background: '#ae89ff',
                color: '#2a0066',
                borderRadius: '12px',
                border: 'none',
                fontSize: '14px',
                fontWeight: 600,
                cursor: saving ? 'wait' : 'pointer',
                fontFamily: 'inherit',
                opacity: saving ? 0.7 : 1,
                transition:
                  'transform 0.2s cubic-bezier(0.22,1,0.36,1), opacity 0.2s cubic-bezier(0.22,1,0.36,1)',
              }}
              onMouseEnter={(e) => {
                if (!saving) (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.03)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
              }}
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      )}

      {/* ── Appearance (always-visible, toggleable cosmetics studio) ──
          Lives outside the About edit mode so users can tweak their
          title/frame/background/name style at any time with a dedicated
          save button. Collapsed by default to keep the profile skimmable;
          the header row stays a clickable region that expands/collapses
          the panel. Seeded on mount from /api/user/profile. */}
      <div
        style={{
          background: '#21213e',
          borderRadius: isPhone ? '20px' : '24px',
          padding: isPhone ? '20px' : '28px 32px',
          display: 'flex',
          flexDirection: 'column',
          gap: appearanceOpen ? '20px' : 0,
          transition: 'gap 0.25s cubic-bezier(0.22,1,0.36,1)',
        }}
      >
        {/* Header row: click anywhere to toggle. The Save button lives
            inside this row and stops propagation so tapping Save doesn't
            collapse the panel. */}
        <button
          type="button"
          onClick={() => setAppearanceOpen((v) => !v)}
          aria-expanded={appearanceOpen}
          aria-controls="appearance-panel-body"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
            flexWrap: 'wrap',
            background: 'transparent',
            border: 'none',
            padding: 0,
            margin: 0,
            cursor: 'pointer',
            textAlign: 'left',
            color: 'inherit',
            fontFamily: 'inherit',
            width: '100%',
          }}
        >
          <div style={{ minWidth: 0, flex: 1 }}>
            <h3
              style={{
                fontSize: '15px',
                fontWeight: 700,
                color: '#e5e3ff',
                margin: 0,
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: '20px', color: '#ae89ff' }}
              >
                auto_awesome
              </span>
              Appearance
              <span
                className="material-symbols-outlined"
                aria-hidden
                style={{
                  fontSize: '20px',
                  color: '#8888a8',
                  marginLeft: 'auto',
                  transform: appearanceOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 0.25s cubic-bezier(0.22,1,0.36,1)',
                }}
              >
                expand_more
              </span>
            </h3>
            <p
              style={{
                fontSize: '12px',
                color: '#8888a8',
                margin: '6px 0 0',
                lineHeight: 1.5,
                maxWidth: 520,
              }}
            >
              {appearanceOpen
                ? 'Level up to unlock new titles, fonts, colors, frames and profile backgrounds. Locked items show the level you need.'
                : 'Titles, fonts, colors, frames and backgrounds. Tap to customize.'}
            </p>
          </div>

          {/* Save button + feedback chip — only reachable when expanded. */}
          {appearanceOpen && (
            <div
              // Clicks on the save button / feedback chip must NOT toggle
              // the panel, or the user would collapse the thing they just
              // tried to save.
              onClick={(e) => e.stopPropagation()}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                flexShrink: 0,
              }}
            >
              {cosmeticsFeedback && (
                <span
                  style={{
                    fontSize: '12px',
                    fontWeight: 600,
                    color: cosmeticsFeedback.kind === 'saved' ? '#4efba5' : '#fd6f85',
                  }}
                >
                  {cosmeticsFeedback.message}
                </span>
              )}
              <span
                role="button"
                tabIndex={0}
                aria-disabled={!cosmeticsDirty || cosmeticsSaving}
                onClick={(e) => {
                  e.stopPropagation();
                  if (cosmeticsDirty && !cosmeticsSaving) handleSaveCosmetics();
                }}
                onKeyDown={(e) => {
                  if ((e.key === 'Enter' || e.key === ' ') && cosmeticsDirty && !cosmeticsSaving) {
                    e.preventDefault();
                    e.stopPropagation();
                    handleSaveCosmetics();
                  }
                }}
                style={{
                  padding: '10px 22px',
                  background:
                    !cosmeticsDirty || cosmeticsSaving ? 'rgba(174,137,255,0.18)' : '#ae89ff',
                  color: !cosmeticsDirty || cosmeticsSaving ? '#aaa8c8' : '#2a0066',
                  borderRadius: '12px',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: !cosmeticsDirty || cosmeticsSaving ? 'default' : 'pointer',
                  transition:
                    'transform 0.2s cubic-bezier(0.22,1,0.36,1), background 0.2s cubic-bezier(0.22,1,0.36,1)',
                  userSelect: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                }}
              >
                {cosmeticsSaving ? 'Saving…' : cosmeticsDirty ? 'Save appearance' : 'Saved'}
              </span>
            </div>
          )}
        </button>

        {/* Collapsible body. Using display:none when closed keeps the
            initial DOM lightweight and prevents the (expensive) cosmetics
            rails from rendering for users who never open the panel. */}
        {appearanceOpen && (
          <div id="appearance-panel-body">
            <CosmeticsPanel
              value={cosmeticsForm}
              onChange={handleCosmeticsChange}
              previewUser={{
                name: profile.name,
                username: profile.username,
                avatarUrl: profile.avatarUrl,
              }}
              compact={isPhone}
              isAdmin={profile.role === 'admin'}
            />
          </div>
        )}
      </div>

      {/* Bento: Socials + Activity. Mirrors the public profile layout
          (`app/(dashboard)/profile/[username]/page.tsx`) so the edit page
          and the public view share the same visual story. The activity
          column uses minmax(0, 1fr) so the heatmap (which is wider than
          ~440px) doesn't blow out the 720px parent — its internal
          overflowX:auto kicks in and it scrolls horizontally inside its
          own card. Friend request UI stays hidden because it's the user's
          own profile (isOwnProfile + isAuthenticated short-circuit). */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isPhone ? '1fr' : 'minmax(220px, 260px) minmax(0, 1fr)',
          gap: '24px',
          alignItems: 'stretch',
        }}
      >
        <SocialsCard
          friendsCount={friendsCount}
          instagramHandle={profile.instagramHandle ?? null}
          linkedinUrl={profile.linkedinUrl ?? null}
          friendshipStatus={null}
          friendshipId={null}
          username={profile.username}
          isOwnProfile
          isAuthenticated={Boolean(session?.user)}
        />
        <div style={{ minWidth: 0 }}>
          <ActivityHeatmap userId={profile.id} weeks={13} subtitle="3 months" />
        </div>
      </div>

      {/* Trophy Board (recent + expandable to full shelf) */}
      <RecentTrophies userId={profile.id} />

      {/* Edit Profile Modal */}
      {editModalOpen && profile && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.7)',
            backdropFilter: 'blur(8px)',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !modalSaving) setEditModalOpen(false);
          }}
        >
          <div
            style={{
              background: '#272746',
              borderRadius: isPhone ? '20px' : '24px',
              padding: isPhone ? '24px 20px' : '32px',
              display: 'flex',
              flexDirection: 'column',
              gap: isPhone ? '20px' : '24px',
              maxWidth: '420px',
              width: '90%',
              boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#e5e3ff' }}>
                Edit Profile
              </h3>
              <button
                onClick={() => setEditModalOpen(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#aaa8c8',
                  cursor: 'pointer',
                  padding: '4px',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = 'rgba(170,168,200,0.1)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
                  close
                </span>
              </button>
            </div>

            {/* Avatar section */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '12px',
              }}
            >
              <UserAvatar
                user={profile}
                size={96}
                radius="50%"
                style={{
                  border: profile.equippedFrameId ? 'none' : '3px solid rgba(174,137,255,0.3)',
                }}
              />
              <button
                onClick={() => setAvatarEditorOpen(true)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 16px',
                  background: 'rgba(174,137,255,0.12)',
                  color: '#ae89ff',
                  borderRadius: '10px',
                  border: '1px solid rgba(174,137,255,0.2)',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  transition: 'background 0.2s cubic-bezier(0.22,1,0.36,1)',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = 'rgba(174,137,255,0.2)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background =
                    'rgba(174,137,255,0.12)';
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
                  photo_camera
                </span>
                Change Photo
              </button>
            </div>

            {/* Username input */}
            <div>
              <label style={LABEL_STYLE}>Username</label>
              <div style={{ position: 'relative' }}>
                <span
                  style={{
                    position: 'absolute',
                    left: '14px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    fontSize: '14px',
                    color: '#8888a8',
                    pointerEvents: 'none',
                  }}
                >
                  @
                </span>
                <input
                  type="text"
                  value={usernameInput}
                  onChange={(e) => handleUsernameChange(e.target.value)}
                  maxLength={20}
                  placeholder="username"
                  style={{
                    ...INPUT_STYLE,
                    paddingLeft: '32px',
                    paddingRight: '40px',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(174,137,255,0.5)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(170,168,200,0.2)';
                  }}
                />
                <div
                  style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  {usernameStatus === 'checking' && (
                    <span
                      className="material-symbols-outlined"
                      style={{
                        fontSize: '18px',
                        color: '#aaa8c8',
                        animation: 'spin 1s linear infinite',
                      }}
                    >
                      progress_activity
                    </span>
                  )}
                  {usernameStatus === 'available' && (
                    <span
                      className="material-symbols-outlined"
                      style={{
                        fontSize: '18px',
                        color: '#4dff91',
                        fontVariationSettings: "'FILL' 1",
                      }}
                    >
                      check_circle
                    </span>
                  )}
                  {(usernameStatus === 'taken' || usernameStatus === 'invalid') && (
                    <span
                      className="material-symbols-outlined"
                      style={{
                        fontSize: '18px',
                        color: '#fd6f85',
                        fontVariationSettings: "'FILL' 1",
                      }}
                    >
                      cancel
                    </span>
                  )}
                </div>
              </div>
              {usernameStatus === 'available' && (
                <p style={{ margin: '6px 0 0 4px', fontSize: '12px', color: '#4dff91' }}>
                  {usernameMessage}
                </p>
              )}
              {(usernameStatus === 'taken' || usernameStatus === 'invalid') && (
                <p style={{ margin: '6px 0 0 4px', fontSize: '12px', color: '#fd6f85' }}>
                  {usernameMessage}
                </p>
              )}
              {(usernameStatus === 'idle' || usernameStatus === 'typing') && (
                <p style={{ margin: '6px 0 0 4px', fontSize: '12px', color: '#8888a8' }}>
                  3–20 chars, letters, numbers, underscores
                </p>
              )}
            </div>

            {/* Error */}
            {modalError && (
              <p style={{ margin: 0, fontSize: '13px', color: '#fd6f85' }}>{modalError}</p>
            )}

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setEditModalOpen(false)}
                disabled={modalSaving}
                style={{
                  padding: '10px 24px',
                  background: 'transparent',
                  color: '#aaa8c8',
                  borderRadius: '12px',
                  border: '1px solid rgba(170,168,200,0.2)',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  transition: 'background 0.2s cubic-bezier(0.22,1,0.36,1)',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background =
                    'rgba(170,168,200,0.08)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleModalSave}
                disabled={modalSaving || usernameStatus === 'checking'}
                style={{
                  padding: '10px 24px',
                  background: '#ae89ff',
                  color: '#2a0066',
                  borderRadius: '12px',
                  border: 'none',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: modalSaving ? 'wait' : 'pointer',
                  fontFamily: 'inherit',
                  opacity: modalSaving ? 0.7 : 1,
                  transition:
                    'transform 0.2s cubic-bezier(0.22,1,0.36,1), opacity 0.2s cubic-bezier(0.22,1,0.36,1)',
                }}
                onMouseEnter={(e) => {
                  if (!modalSaving)
                    (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.03)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
                }}
              >
                {modalSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Avatar Editor (nested over the modal) */}
      <AvatarEditor
        open={avatarEditorOpen}
        onClose={() => setAvatarEditorOpen(false)}
        onSaved={async () => {
          setAvatarEditorOpen(false);
          const res = await fetch('/api/user/profile');
          const json = await res.json();
          if (json.data?.id) setProfile(json.data);
          await updateSession();
        }}
      />
    </div>
  );
}
