'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState, useRef, useCallback } from 'react';
import AvatarEditor from '@/components/ui/AvatarEditor';
import ActivityHeatmap from '@/components/features/ActivityHeatmap';
import SocialsCard from '@/components/features/SocialsCard';
import RecentTrophies from '@/components/features/RecentTrophies';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { CosmeticsPanel, type CosmeticsSelection } from '@/components/cosmetics/CosmeticsPanel';
import { ProfileHero } from '@/components/profile/ProfileHero';
import { ProfileStatsStrip } from '@/components/profile/ProfileStatsStrip';
import { AboutLadder } from '@/components/profile/AboutLadder';
import { Switch } from '@/components/ui/Switch';
import { useModalDimensions } from '@/hooks/useModalDimensions';

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

// Shared input style — outline-based focus ring (not border-color) so
// activating an input doesn't shift layout and keyboard focus reads at
// the standard 2px tokenised offset. Hover/focus rules live in a single
// <style> block emitted near the form root.
const INPUT_STYLE: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  background: 'var(--surface-container)',
  border: '1px solid var(--outline-variant)',
  borderRadius: 'var(--radius-md)',
  color: 'var(--on-surface)',
  fontSize: '14px',
  fontFamily: 'inherit',
  outline: 'none',
  // outline-offset reservation lifts the focus ring above the parent
  // background; the actual ring is applied via .hl-input:focus-visible
  // in the <style> block so it doesn't transition.
};

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

  // Friends count for the Socials card. The /api/user/profile (own)
  // endpoint doesn't return this, so we hit /api/friends?status=accepted
  // separately and use its `count` field.
  const [friendsCount, setFriendsCount] = useState<number>(0);

  // Username modal state — opened from inside the edit drawer.
  const [usernameModalOpen, setUsernameModalOpen] = useState(false);
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
    setEditing(true);
  };

  // Username availability check — same logic as before, kept inline so
  // the modal stays self-contained.
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

  const openUsernameModal = () => {
    if (!profile) return;
    setUsernameInput(profile.username);
    setUsernameStatus('idle');
    setUsernameMessage('');
    setModalError('');
    setUsernameModalOpen(true);
  };

  const handleUsernameModalSave = async () => {
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
      setUsernameModalOpen(false);
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
        setUsernameModalOpen(false);
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

  if (loading) return <LoadingState />;
  if (!profile) return <ErrorState />;

  // Hero badges — Private + Hide-achievements pills, only shown on the
  // owner's view so the public page stays clean. Wrap them in a fragment
  // so ProfileHero can render the row.
  const heroBadges = (
    <>
      {profile.profilePrivate && <HeroBadge icon="lock" label="Private" />}
      {profile.hideAchievements && <HeroBadge icon="visibility_off" label="Achievements hidden" />}
    </>
  );

  // About ladder rows — empty when the user has no factual fields filled.
  // The drawer is the editing surface; the ladder is read-only.
  const aboutRows: { key: string; label: string; value: React.ReactNode }[] = [];
  if (profile.age != null) aboutRows.push({ key: 'age', label: 'Age', value: profile.age });
  if (profile.location)
    aboutRows.push({ key: 'location', label: 'Location', value: profile.location });
  if (profile.school) aboutRows.push({ key: 'school', label: 'School', value: profile.school });
  if (profile.lineOfWork) aboutRows.push({ key: 'work', label: 'Work', value: profile.lineOfWork });

  return (
    <div
      data-tutorial="profile"
      style={{
        maxWidth: '720px',
        margin: '0 auto',
        padding: isPhone ? '0 16px' : undefined,
        display: 'flex',
        flexDirection: 'column',
        gap: isPhone ? '20px' : '28px',
      }}
    >
      {/* 1. Hero strip. The Edit button opens the editing mask (modal); the
          page underneath stays put so there's no scroll-to-edit. */}
      <ProfileHero
        user={profile}
        badges={heroBadges}
        action={<EditProfileButton onClick={startEditing} isPhone={isPhone} />}
      />

      {/* 2. Stats strip — 3-cell horizontal row: trophies · minutes ·
          friends. Self-view always shows trophies (the hideAchievements
          toggle hides them from *others*, not the owner). */}
      <ProfileStatsStrip userId={profile.id} friendsCount={friendsCount} />

      {/* 3. Activity heatmap */}
      <ActivityHeatmap userId={profile.id} weeks={13} subtitle="3 months" />

      {/* 4. Trophy rail */}
      <RecentTrophies userId={profile.id} ownerView />

      {/* 5. Bottom row — About (read mode) + Social. Editing happens in the
          EditProfileModal overlay, so this row stays put underneath it. */}
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
          <EmptyAboutPrompt onEdit={startEditing} />
        )}
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
      </div>

      {/* 6. Appearance panel — collapsible. Lives below the bottom row
          so it doesn't push above-the-fold content. */}
      <AppearancePanel
        open={appearanceOpen}
        onToggle={() => setAppearanceOpen((v) => !v)}
        cosmeticsForm={cosmeticsForm}
        onChange={handleCosmeticsChange}
        previewUser={profile}
        dirty={cosmeticsDirty}
        saving={cosmeticsSaving}
        feedback={cosmeticsFeedback}
        onSave={handleSaveCosmetics}
        isPhone={isPhone}
      />

      {/* Modals */}
      {editing && (
        <EditProfileModal
          form={form}
          setForm={setForm}
          saving={saving}
          saveError={saveError}
          onCancel={() => setEditing(false)}
          onSave={handleSave}
          onChangePhoto={() => setAvatarEditorOpen(true)}
          onChangeUsername={openUsernameModal}
          isPhone={isPhone}
        />
      )}

      {usernameModalOpen && (
        <UsernameModal
          usernameInput={usernameInput}
          usernameStatus={usernameStatus}
          usernameMessage={usernameMessage}
          modalSaving={modalSaving}
          modalError={modalError}
          isPhone={isPhone}
          onUsernameChange={handleUsernameChange}
          onPhotoChange={() => setAvatarEditorOpen(true)}
          onClose={() => setUsernameModalOpen(false)}
          onSave={handleUsernameModalSave}
        />
      )}

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

      {/* Shared interaction styles for tokenised inputs / focus rings /
          reduced-motion fallbacks. Single block so the rules don't get
          duplicated per-field. */}
      <style>{`
        .hl-input, .hl-textarea {
          transition: border-color var(--dur-fast) var(--ease-spring);
        }
        .hl-input:focus-visible, .hl-textarea:focus-visible {
          outline: 2px solid var(--color-focus);
          outline-offset: 2px;
          border-color: var(--brand-purple-edge);
        }
        .hl-input:disabled, .hl-textarea:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
        .hl-action-btn {
          transition: transform var(--dur-fast) var(--ease-spring), background-color var(--dur-fast) var(--ease-spring);
          outline: none;
        }
        .hl-action-btn:hover:not(:disabled) { transform: scale(1.02); }
        .hl-action-btn:focus-visible {
          outline: 2px solid var(--color-focus);
          outline-offset: 2px;
        }
        .hl-ghost-btn {
          transition: background-color var(--dur-fast) var(--ease-spring);
          outline: none;
        }
        .hl-ghost-btn:hover:not(:disabled) { background: var(--brand-purple-wash); }
        .hl-ghost-btn:focus-visible {
          outline: 2px solid var(--color-focus);
          outline-offset: 2px;
        }
        @media (prefers-reduced-motion: reduce) {
          .hl-input, .hl-textarea, .hl-action-btn, .hl-ghost-btn {
            transition: none !important;
          }
          .hl-action-btn:hover { transform: none !important; }
        }
      `}</style>
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
          color: 'var(--md-h4)',
          animation: 'spin 1s linear infinite',
        }}
      >
        progress_activity
      </span>
    </div>
  );
}

function ErrorState() {
  return (
    <div
      style={{
        textAlign: 'center',
        padding: '64px 24px',
        color: 'var(--on-surface-variant)',
      }}
    >
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

// ───────────────────────────────────────────────────────────────────────────
// Hero auxiliaries
// ───────────────────────────────────────────────────────────────────────────

function HeroBadge({ icon, label }: { icon: string; label: string }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '3px 10px',
        background: 'var(--surface-container)',
        borderRadius: 'var(--radius-full)',
        fontSize: '11px',
        fontWeight: 600,
        color: 'var(--on-surface-variant)',
        lineHeight: 1.4,
      }}
    >
      <span className="material-symbols-outlined" aria-hidden style={{ fontSize: '13px' }}>
        {icon}
      </span>
      {label}
    </span>
  );
}

function EditProfileButton({ onClick, isPhone }: { onClick: () => void; isPhone: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="hl-action-btn"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        padding: '10px 20px',
        background: 'var(--brand-purple-wash)',
        color: 'var(--md-h4)',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--brand-purple-edge)',
        fontSize: '14px',
        fontWeight: 600,
        whiteSpace: 'nowrap',
        cursor: 'pointer',
        fontFamily: 'inherit',
        width: isPhone ? '100%' : 'auto',
      }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
        edit
      </span>
      Edit profile
    </button>
  );
}

function EmptyAboutPrompt({ onEdit }: { onEdit: () => void }) {
  return (
    <div
      style={{
        background: 'var(--surface-container-low)',
        borderRadius: 'var(--radius-lg)',
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        alignItems: 'flex-start',
        justifyContent: 'center',
      }}
    >
      <h2
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: '18px',
          fontWeight: 700,
          letterSpacing: '-0.01em',
          color: 'var(--on-surface)',
          margin: 0,
        }}
      >
        About
      </h2>
      <p
        style={{
          margin: 0,
          fontSize: '13px',
          color: 'var(--on-surface-variant)',
          lineHeight: 1.5,
        }}
      >
        Add a bio, school, or location so others can find you.
      </p>
      <button
        type="button"
        onClick={onEdit}
        className="hl-action-btn"
        style={{
          marginTop: '4px',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '8px 14px',
          background: 'var(--brand-purple-wash)',
          color: 'var(--md-h4)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--brand-purple-edge)',
          fontSize: '13px',
          fontWeight: 600,
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
          edit
        </span>
        Add details
      </button>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Edit profile modal — opened from the hero "Edit profile" button. All About
// fields + privacy toggles live here so editing happens in one focused mask
// instead of an inline drawer the user has to scroll the page to reach.
// ───────────────────────────────────────────────────────────────────────────

interface EditProfileModalProps {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  saving: boolean;
  saveError: string | null;
  onCancel: () => void;
  onSave: () => void;
  onChangePhoto: () => void;
  onChangeUsername: () => void;
  isPhone: boolean;
}

function EditProfileModal({
  form,
  setForm,
  saving,
  saveError,
  onCancel,
  onSave,
  onChangePhoto,
  onChangeUsername,
  isPhone,
}: EditProfileModalProps) {
  // Centered, capped, internally-scrolling dialog (full-bleed sheet on phone).
  const dims = useModalDimensions(560);

  // Escape closes the mask, mirroring backdrop-click. Disabled mid-save so a
  // stray keypress can't drop the in-flight request's UI.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [saving, onCancel]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="hl-edit-profile-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onCancel();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 300,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--scrim-modal)',
        backdropFilter: 'blur(8px)',
        padding: isPhone ? 0 : '16px',
      }}
    >
      <div
        style={{
          ...dims,
          background: 'var(--surface-container)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 24px 64px var(--bento-hover-shadow)',
        }}
      >
        {/* Sticky header — title + close. Photo/Handle live in the body so the
            header stays uncluttered on phone. */}
        <div
          style={{
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            padding: isPhone ? '18px 20px' : '22px 28px',
            borderBottom: '1px solid var(--rule-hairline)',
          }}
        >
          <h2
            id="hl-edit-profile-title"
            style={{
              margin: 0,
              fontFamily: 'var(--font-display)',
              fontSize: '20px',
              fontWeight: 700,
              letterSpacing: '-0.01em',
              color: 'var(--on-surface)',
            }}
          >
            Edit profile
          </h2>
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            aria-label="Close"
            className="hl-ghost-btn"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--on-surface-variant)',
              cursor: 'pointer',
              padding: '4px',
              borderRadius: 'var(--radius-sm)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '22px' }}>
              close
            </span>
          </button>
        </div>

        {/* Scrollable body — every field. The dialog caps at the viewport
            height, so long forms scroll here while header/footer stay fixed. */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            padding: isPhone ? '20px' : '24px 28px',
            display: 'flex',
            flexDirection: 'column',
            gap: isPhone ? '16px' : '20px',
          }}
        >
          {/* Photo + Handle quick actions, split evenly across the row. */}
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              onClick={onChangePhoto}
              className="hl-ghost-btn"
              style={{
                flex: 1,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '10px 12px',
                background: 'transparent',
                border: '1px solid var(--brand-purple-edge)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--md-h4)',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
                whiteSpace: 'nowrap',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
                photo_camera
              </span>
              Photo
            </button>
            <button
              type="button"
              onClick={onChangeUsername}
              className="hl-ghost-btn"
              style={{
                flex: 1,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '10px 12px',
                background: 'transparent',
                border: '1px solid var(--brand-purple-edge)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--md-h4)',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
                whiteSpace: 'nowrap',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
                alternate_email
              </span>
              Handle
            </button>
          </div>

          <Field label="Name">
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              maxLength={100}
              placeholder="Your full name"
              className="hl-input"
              style={INPUT_STYLE}
            />
          </Field>

          <Field label="Bio" helper={`${form.bio.length}/160`}>
            <textarea
              value={form.bio}
              onChange={(e) => setForm({ ...form, bio: e.target.value })}
              maxLength={160}
              placeholder="Write a short description about yourself"
              rows={3}
              className="hl-textarea"
              style={{
                ...INPUT_STYLE,
                resize: 'vertical',
                minHeight: '72px',
                fontFamily: 'inherit',
              }}
            />
          </Field>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isPhone ? '1fr' : '1fr 1fr',
              gap: '14px',
            }}
          >
            <Field label="Age">
              <input
                type="number"
                value={form.age}
                onChange={(e) => setForm({ ...form, age: e.target.value })}
                min={1}
                max={150}
                placeholder="—"
                className="hl-input"
                style={INPUT_STYLE}
              />
            </Field>
            <Field label="Location">
              <input
                type="text"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                maxLength={100}
                placeholder="City, Country"
                className="hl-input"
                style={INPUT_STYLE}
              />
            </Field>
            <Field label="School">
              <input
                type="text"
                value={form.school}
                onChange={(e) => setForm({ ...form, school: e.target.value })}
                maxLength={100}
                placeholder="Your school or university"
                className="hl-input"
                style={INPUT_STYLE}
              />
            </Field>
            <Field label="Line of work">
              <input
                type="text"
                value={form.lineOfWork}
                onChange={(e) => setForm({ ...form, lineOfWork: e.target.value })}
                maxLength={100}
                placeholder="Your profession"
                className="hl-input"
                style={INPUT_STYLE}
              />
            </Field>
            <Field label="Instagram">
              <input
                type="text"
                value={form.instagramHandle}
                onChange={(e) => setForm({ ...form, instagramHandle: e.target.value })}
                maxLength={30}
                placeholder="yourhandle"
                className="hl-input"
                style={INPUT_STYLE}
              />
            </Field>
            <Field label="LinkedIn">
              <input
                type="url"
                value={form.linkedinUrl}
                onChange={(e) => setForm({ ...form, linkedinUrl: e.target.value })}
                maxLength={200}
                placeholder="https://linkedin.com/in/you"
                className="hl-input"
                style={INPUT_STYLE}
              />
            </Field>
          </div>

          {/* Privacy block — separated by hairline so the toggles read as
          their own section without an UPPERCASE eyebrow. */}
          <div style={{ borderTop: '1px solid var(--rule-hairline)', paddingTop: '18px' }}>
            <h3
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '14px',
                fontWeight: 700,
                color: 'var(--on-surface)',
                margin: '0 0 12px',
              }}
            >
              Privacy
            </h3>
            <ToggleRow
              icon="lock"
              title="Private profile"
              description="Only friends can see your full profile"
              checked={form.profilePrivate}
              onChange={(next) => setForm({ ...form, profilePrivate: next })}
            />
            <div style={{ height: '10px' }} />
            <ToggleRow
              icon="visibility_off"
              title="Hide achievements"
              description="Others cannot see your achievements"
              checked={form.hideAchievements}
              onChange={(next) => setForm({ ...form, hideAchievements: next })}
            />
          </div>
        </div>

        {/* Sticky footer — error + actions stay reachable without scrolling
            the body. */}
        <div
          style={{
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
            padding: isPhone ? '16px 20px' : '18px 28px',
            borderTop: '1px solid var(--rule-hairline)',
          }}
        >
          {saveError && (
            <div
              role="alert"
              style={{
                background: 'var(--error-container)',
                border: '1px solid var(--error)',
                color: 'var(--on-error-container)',
                borderRadius: 'var(--radius-md)',
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

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onCancel}
              disabled={saving}
              className="hl-ghost-btn"
              style={{
                padding: '10px 20px',
                background: 'transparent',
                color: 'var(--on-surface-variant)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--outline-variant)',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              className="hl-action-btn"
              style={{
                padding: '10px 22px',
                background: 'var(--brand-purple-strong)',
                color: 'var(--brand-purple-ink)',
                borderRadius: 'var(--radius-md)',
                border: 'none',
                fontSize: '14px',
                fontWeight: 700,
                cursor: saving ? 'wait' : 'pointer',
                fontFamily: 'inherit',
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  helper,
  children,
}: {
  label: string;
  helper?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        style={{
          fontSize: '12px',
          fontWeight: 500,
          color: 'var(--on-surface-variant)',
          marginBottom: '6px',
          display: 'block',
        }}
      >
        {label}
      </label>
      {children}
      {helper && (
        <p
          style={{
            fontSize: '11px',
            color: 'var(--on-surface-variant)',
            margin: '4px 0 0',
            textAlign: 'right',
            // Reserve the helper slot so a transient error appearing
            // doesn't push the page down.
            minHeight: '1lh',
          }}
        >
          {helper}
        </p>
      )}
    </div>
  );
}

function ToggleRow({
  icon,
  title,
  description,
  checked,
  onChange,
}: {
  icon: string;
  title: string;
  description: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 14px',
        background: 'var(--surface-container)',
        borderRadius: 'var(--radius-md)',
        gap: '12px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
        <span
          className="material-symbols-outlined"
          aria-hidden
          style={{ fontSize: '20px', color: 'var(--md-h4)', flexShrink: 0 }}
        >
          {icon}
        </span>
        <div style={{ minWidth: 0 }}>
          <p
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: 'var(--on-surface)',
              margin: 0,
            }}
          >
            {title}
          </p>
          <p
            style={{
              fontSize: '11px',
              color: 'var(--on-surface-variant)',
              margin: '2px 0 0',
            }}
          >
            {description}
          </p>
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={title} />
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Appearance panel
// ───────────────────────────────────────────────────────────────────────────

interface AppearancePanelProps {
  open: boolean;
  onToggle: () => void;
  cosmeticsForm: CosmeticsSelection;
  onChange: (next: CosmeticsSelection) => void;
  previewUser: ProfileData;
  dirty: boolean;
  saving: boolean;
  feedback: { kind: 'saved' | 'error'; message: string } | null;
  onSave: () => void;
  isPhone: boolean;
}

function AppearancePanel({
  open,
  onToggle,
  cosmeticsForm,
  onChange,
  previewUser,
  dirty,
  saving,
  feedback,
  onSave,
  isPhone,
}: AppearancePanelProps) {
  return (
    <section
      style={{
        background: 'var(--surface-container-low)',
        borderRadius: 'var(--radius-xl)',
        padding: isPhone ? '20px' : '24px 28px',
        display: 'flex',
        flexDirection: 'column',
        gap: open ? '20px' : 0,
        transition: 'gap var(--dur-normal) var(--ease-spring)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: '16px',
          flexWrap: 'wrap',
        }}
      >
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls="appearance-panel-body"
          className="hl-ghost-btn"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            background: 'transparent',
            border: 'none',
            padding: '4px 0',
            cursor: 'pointer',
            textAlign: 'left',
            color: 'inherit',
            fontFamily: 'inherit',
            flex: 1,
            minWidth: 0,
          }}
        >
          <span
            className="material-symbols-outlined"
            aria-hidden
            style={{ fontSize: '20px', color: 'var(--md-h4)' }}
          >
            auto_awesome
          </span>
          <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <span
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '18px',
                fontWeight: 700,
                letterSpacing: '-0.01em',
                color: 'var(--on-surface)',
              }}
            >
              Appearance
            </span>
            <span
              style={{
                fontSize: '12px',
                color: 'var(--on-surface-variant)',
                lineHeight: 1.5,
                marginTop: '2px',
              }}
            >
              {open
                ? 'Earn achievements to unlock new titles, fonts, colors, frames and backgrounds.'
                : 'Titles, fonts, colors, frames and backgrounds.'}
            </span>
          </span>
          <span
            className="material-symbols-outlined"
            aria-hidden
            style={{
              fontSize: '20px',
              color: 'var(--on-surface-variant)',
              marginLeft: 'auto',
              transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform var(--dur-normal) var(--ease-spring)',
            }}
          >
            expand_more
          </span>
        </button>

        {/* Save button + feedback — only renders when the panel is open
            so the collapsed header stays focused on the title. */}
        {open && (
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              flexShrink: 0,
            }}
          >
            {feedback && (
              <span
                role="status"
                aria-live="polite"
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  color: feedback.kind === 'saved' ? 'var(--success)' : 'var(--error)',
                }}
              >
                {feedback.message}
              </span>
            )}
            <button
              type="button"
              onClick={onSave}
              disabled={!dirty || saving}
              className="hl-action-btn"
              style={{
                padding: '10px 20px',
                background:
                  !dirty || saving ? 'var(--brand-purple-wash)' : 'var(--brand-purple-strong)',
                color: !dirty || saving ? 'var(--on-surface-variant)' : 'var(--brand-purple-ink)',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                fontSize: '13px',
                fontWeight: 700,
                cursor: !dirty || saving ? 'default' : 'pointer',
                fontFamily: 'inherit',
                whiteSpace: 'nowrap',
              }}
            >
              {saving ? 'Saving…' : dirty ? 'Save appearance' : 'Saved'}
            </button>
          </div>
        )}
      </div>

      {open && (
        <div id="appearance-panel-body">
          <CosmeticsPanel
            value={cosmeticsForm}
            onChange={onChange}
            previewUser={{
              name: previewUser.name,
              username: previewUser.username,
              avatarUrl: previewUser.avatarUrl,
            }}
            compact={isPhone}
            isAdmin={previewUser.role === 'admin'}
          />
        </div>
      )}
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Username modal
// ───────────────────────────────────────────────────────────────────────────

interface UsernameModalProps {
  usernameInput: string;
  usernameStatus: UsernameStatus;
  usernameMessage: string;
  modalSaving: boolean;
  modalError: string;
  isPhone: boolean;
  onUsernameChange: (value: string) => void;
  onPhotoChange: () => void;
  onClose: () => void;
  onSave: () => void;
}

function UsernameModal({
  usernameInput,
  usernameStatus,
  usernameMessage,
  modalSaving,
  modalError,
  isPhone,
  onUsernameChange,
  onPhotoChange,
  onClose,
  onSave,
}: UsernameModalProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="hl-username-modal-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 400,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--scrim-modal)',
        backdropFilter: 'blur(8px)',
        padding: '16px',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !modalSaving) onClose();
      }}
    >
      <div
        style={{
          background: 'var(--surface-container)',
          borderRadius: 'var(--radius-xl)',
          padding: isPhone ? '22px 20px' : '28px 32px',
          display: 'flex',
          flexDirection: 'column',
          gap: isPhone ? '18px' : '22px',
          maxWidth: '420px',
          width: '100%',
          boxShadow: '0 24px 64px var(--bento-hover-shadow)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2
            id="hl-username-modal-title"
            style={{
              margin: 0,
              fontFamily: 'var(--font-display)',
              fontSize: '20px',
              fontWeight: 700,
              letterSpacing: '-0.01em',
              color: 'var(--on-surface)',
            }}
          >
            Account details
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={modalSaving}
            aria-label="Close"
            className="hl-ghost-btn"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--on-surface-variant)',
              cursor: 'pointer',
              padding: '4px',
              borderRadius: 'var(--radius-sm)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
              close
            </span>
          </button>
        </div>

        {/* Photo line — kept as a simple inline button instead of a
            centered "change photo" stack which would re-introduce the
            centered hero pattern. */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            justifyContent: 'space-between',
          }}
        >
          <span
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: 'var(--on-surface)',
            }}
          >
            Profile photo
          </span>
          <button
            type="button"
            onClick={onPhotoChange}
            className="hl-ghost-btn"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              background: 'var(--brand-purple-wash)',
              color: 'var(--md-h4)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--brand-purple-edge)',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
              photo_camera
            </span>
            Change
          </button>
        </div>

        {/* Username field */}
        <div>
          <label
            htmlFor="hl-username-input"
            style={{
              fontSize: '12px',
              fontWeight: 500,
              color: 'var(--on-surface-variant)',
              marginBottom: '6px',
              display: 'block',
            }}
          >
            Username
          </label>
          <div style={{ position: 'relative' }}>
            <span
              aria-hidden
              style={{
                position: 'absolute',
                left: '14px',
                top: '50%',
                transform: 'translateY(-50%)',
                fontSize: '14px',
                color: 'var(--on-surface-variant)',
                pointerEvents: 'none',
              }}
            >
              @
            </span>
            <input
              id="hl-username-input"
              type="text"
              value={usernameInput}
              onChange={(e) => onUsernameChange(e.target.value)}
              maxLength={20}
              placeholder="username"
              className="hl-input"
              style={{
                ...INPUT_STYLE,
                paddingLeft: '32px',
                paddingRight: '40px',
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
                  aria-label="Checking availability"
                  style={{
                    fontSize: '18px',
                    color: 'var(--on-surface-variant)',
                    animation: 'spin 1s linear infinite',
                  }}
                >
                  progress_activity
                </span>
              )}
              {usernameStatus === 'available' && (
                <span
                  className="material-symbols-outlined"
                  aria-label="Available"
                  style={{
                    fontSize: '18px',
                    color: 'var(--success)',
                    fontVariationSettings: "'FILL' 1",
                  }}
                >
                  check_circle
                </span>
              )}
              {(usernameStatus === 'taken' || usernameStatus === 'invalid') && (
                <span
                  className="material-symbols-outlined"
                  aria-label={usernameStatus === 'taken' ? 'Taken' : 'Invalid'}
                  style={{
                    fontSize: '18px',
                    color: 'var(--error)',
                    fontVariationSettings: "'FILL' 1",
                  }}
                >
                  cancel
                </span>
              )}
            </div>
          </div>
          <p
            style={{
              margin: '6px 0 0 4px',
              fontSize: '12px',
              color:
                usernameStatus === 'available'
                  ? 'var(--success)'
                  : usernameStatus === 'taken' || usernameStatus === 'invalid'
                    ? 'var(--error)'
                    : 'var(--on-surface-variant)',
              minHeight: '1lh',
            }}
          >
            {usernameStatus === 'available' ||
            usernameStatus === 'taken' ||
            usernameStatus === 'invalid'
              ? usernameMessage
              : '3–20 chars, letters, numbers, underscores'}
          </p>
        </div>

        {modalError && (
          <p role="alert" style={{ margin: 0, fontSize: '13px', color: 'var(--error)' }}>
            {modalError}
          </p>
        )}

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
            disabled={modalSaving}
            className="hl-ghost-btn"
            style={{
              padding: '10px 20px',
              background: 'transparent',
              color: 'var(--on-surface-variant)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--outline-variant)',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={modalSaving || usernameStatus === 'checking'}
            className="hl-action-btn"
            style={{
              padding: '10px 22px',
              background: 'var(--brand-purple-strong)',
              color: 'var(--brand-purple-ink)',
              borderRadius: 'var(--radius-md)',
              border: 'none',
              fontSize: '14px',
              fontWeight: 700,
              cursor: modalSaving ? 'wait' : 'pointer',
              fontFamily: 'inherit',
              opacity: modalSaving ? 0.7 : 1,
            }}
          >
            {modalSaving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
