'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import { signOut } from 'next-auth/react';
import { useSession } from 'next-auth/react';
import AppShell from '@/components/app/AppShell';
import MageTip from '@/components/app/MageTip';
import AvatarEditor from '@/components/ui/AvatarEditor';
import { Switch } from '@/components/ui/Switch';
import { ACHIEVEMENTS } from '@/lib/achievements';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { useModalDimensions } from '@/hooks/useModalDimensions';
import ui from '@/components/app/ui.module.css';
import styles from './Profile.module.css';

/* Profile (Web). Matches Figma frame 96:3 exactly, wired to real data:
   - Hero: avatar, name, email, tier pill + day-streak pill, Edit button
   - Stats strip: Day streak · Active paths · Questions · Accuracy (real,
     with empty states when the user has no data yet)
   - Achievements (inline AchievementsSection, real)
   - Pro upsell (free tier only) · settings rows → /settings · Log out
   Edit / avatar / username remain reachable from the hero Edit button.
   The design has no heatmap / about / socials / inline cosmetics panel —
   those are intentionally absent here (cosmetics live in /settings). */

// ── Types ──────────────────────────────────────────────────────────────────

export interface ProfileData {
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

type UsernameStatus = 'idle' | 'typing' | 'checking' | 'available' | 'taken' | 'invalid';

interface QuizStats {
  questionsAnswered: number;
  accuracy: number | null;
}

interface ProfileViewProps {
  profile: ProfileData | null;
  errored: boolean;
  streak: number | null;
  activePaths: number | null;
  quizStats: QuizStats | null;
  achievements: UnlockedItem[];
  userEmail: string;
  userTier: string;
}

const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,20}$/;

// Shared input style reused across the edit modal and username modal.
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
};

const SETTINGS: { icon: string; label: string; href: string }[] = [
  { icon: 'person', label: 'Account', href: '/settings/account' },
  { icon: 'notifications', label: 'Notifications', href: '/settings/notifications' },
  { icon: 'dark_mode', label: 'Appearance', href: '/settings/appearance' },
  { icon: 'star', label: 'Subscription', href: '/settings/subscription' },
  { icon: 'help', label: 'Help & support', href: '/settings/help' },
];

// ── Icon helper ────────────────────────────────────────────────────────────

function MsIcon({ name, size = 18 }: { name: string; size?: number }) {
  return (
    <span className="material-symbols-outlined" style={{ fontSize: size, color: 'inherit' }} aria-hidden>
      {name}
    </span>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function ProfileView({
  profile: initialProfile,
  errored,
  streak,
  activePaths,
  quizStats,
  achievements,
  userEmail,
  userTier,
}: ProfileViewProps) {
  const { update: updateSession } = useSession();
  const { isPhone } = useBreakpoint();

  // Seeded from SSR but mutable so edit / username / avatar saves update it.
  const [profile, setProfile] = useState<ProfileData | null>(initialProfile);

  // Edit modal state
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({
    name: '', bio: '', age: '', location: '', school: '',
    lineOfWork: '', instagramHandle: '', linkedinUrl: '',
    profilePrivate: false, hideAchievements: false,
  });

  // Avatar editor
  const [avatarEditorOpen, setAvatarEditorOpen] = useState(false);

  // Username modal state
  const [usernameModalOpen, setUsernameModalOpen] = useState(false);
  const [usernameInput, setUsernameInput] = useState('');
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>('idle');
  const [usernameMessage, setUsernameMessage] = useState('');
  const [modalSaving, setModalSaving] = useState(false);
  const [modalError, setModalError] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup debounce on unmount.
  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  // ── Edit modal handlers ─────────────────────────────────────────────────

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
    setSaveError(null);
    setEditing(true);
  };

  const handleSave = async () => {
    if (!profile) return;
    setSaving(true);
    setSaveError(null);
    try {
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
        }),
      });
      if (res.ok) {
        const json = await res.json();
        const updated = json?.data ?? json;
        setProfile(updated);
        await updateSession();
        setEditing(false);
      } else {
        const errJson = await res.json().catch(() => null);
        setSaveError(errJson?.error || `Save failed (${res.status})`);
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  // ── Username modal handlers ─────────────────────────────────────────────

  const checkUsername = useCallback(async (value: string) => {
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
      const res = await fetch(`/api/user/check-username?username=${encodeURIComponent(normalized)}`);
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
  }, [profile]);

  const handleUsernameChange = (value: string) => {
    setUsernameInput(value);
    setUsernameStatus('typing');
    setUsernameMessage('');
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.length >= 3) {
      debounceRef.current = setTimeout(() => checkUsername(value), 500);
    }
  };

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
    if (usernameStatus === 'taken') { setModalError('That username is already taken'); return; }
    if (usernameStatus === 'checking') { setModalError('Please wait while we check availability'); return; }
    if (normalized === profile.username) { setUsernameModalOpen(false); return; }

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

  // ── Error ──────────────────────────────────────────────────────────────

  if (errored || !profile) {
    return (
      <AppShell>
        <div className={ui.card} style={{ marginTop: 30, padding: '52px 32px', textAlign: 'center' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/mascot/holding-wand-v2.png" alt="" style={{ height: 72, margin: '0 auto 12px', display: 'block' }} />
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>Could not load profile</div>
          <p style={{ marginTop: 6, fontSize: 14, color: 'var(--body)' }}>Refresh the page to try again.</p>
        </div>
      </AppShell>
    );
  }

  // Derived display values from real data.
  const displayName = profile.name || profile.username;
  // tier is the Prisma Tier enum, UPPERCASE ('FREE' / 'PRO'). Treat anything
  // that isn't PRO (FREE, empty, unknown) as free so the upsell shows correctly.
  const isFree = (userTier ?? '').toUpperCase() !== 'PRO';

  // Stat-cell display helpers (empty state = em dash while unknown).
  const streakNum = streak ?? 0;
  const statStreak = streak === null ? '—' : String(streak);
  const statActive = activePaths === null ? '—' : String(activePaths);
  const statQuestions = quizStats === null ? '—' : String(quizStats.questionsAnswered);
  const statAccuracy = quizStats === null ? '—' : quizStats.accuracy === null ? '—' : `${quizStats.accuracy}%`;

  return (
    <AppShell>
      <div className={styles.wrap}>

        {/* ── Hero ── */}
        <section className={styles.hero}>
          <div
            className={styles.avatar}
            style={profile.avatarUrl ? {
              backgroundImage: `url(${profile.avatarUrl})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            } : undefined}
          />

          <div className={styles.heroInfo}>
            <div className={styles.name}>{displayName}</div>
            {userEmail && <div className={styles.email}>{userEmail}</div>}
            <div className={styles.heroPills}>
              <span className={`${ui.pill} ${ui.pillPurple}`}>{isFree ? 'Free plan' : 'Pro'}</span>
              {streakNum > 0 && (
                <span className={`${ui.pill} ${ui.pillPurple}`}>
                  <span className="material-symbols-outlined" style={{ fontSize: 13 }} aria-hidden>
                    local_fire_department
                  </span>
                  {streakNum}-day streak
                </span>
              )}
            </div>
          </div>

          <button type="button" className={styles.editBtn} onClick={startEditing}>
            Edit
          </button>
        </section>

        <div className={styles.body}>

          {/* ── Left column ── */}
          <div className={styles.left}>

            {/* Stats strip — Day streak · Active paths · Questions · Accuracy */}
            <div className={styles.statsCard}>
              <div className={styles.statCol}>
                <div className={styles.statNum}>{statStreak}</div>
                <div className={styles.statLabel}>Day streak</div>
              </div>
              <div className={styles.statCol}>
                <div className={styles.statNum}>{statActive}</div>
                <div className={styles.statLabel}>Active paths</div>
              </div>
              <div className={styles.statCol}>
                <div className={styles.statNum}>{statQuestions}</div>
                <div className={styles.statLabel}>Questions</div>
              </div>
              <div className={styles.statCol}>
                <div className={styles.statNum}>{statAccuracy}</div>
                <div className={styles.statLabel}>Accuracy</div>
              </div>
            </div>

            {/* Achievements — matches Figma 96:52–96:76 (LATEST card + tiles) */}
            <AchievementsSection initialUnlocked={achievements} />

            <div className={styles.tipWrap}>
              <MageTip
                text={
                  streakNum > 0
                    ? `You're on a ${streakNum}-day streak — keep it going.`
                    : 'Study today to start your streak.'
                }
                mascot="/mascot/pointing-left-v2.png"
              />
            </div>
          </div>

          {/* ── Right column ── */}
          <div className={styles.right}>
            {/* Pro card (Figma 96:82). Free tier → upsell; Pro tier → a matching
                "You're a Pro user" card (same purple shell, no Upgrade CTA). */}
            <div
                style={{
                  position: 'relative',
                  overflow: 'hidden',
                  background: '#7c5cff',
                  borderRadius: 22,
                  boxShadow: '0 12px 26px rgba(124,92,255,0.32)',
                  padding: '22px 24px',
                  minHeight: 150,
                }}
              >
                <div style={{ fontSize: 17, fontWeight: 700, color: '#fff', maxWidth: 190 }}>
                  {isFree ? 'Prepare faster with Pro' : "You're a Pro user!"}
                </div>
                <div style={{ marginTop: 8, fontSize: 13.5, lineHeight: 1.45, color: 'rgba(255,255,255,0.85)', maxWidth: 190 }}>
                  {isFree
                    ? 'Unlimited paths, exam mode, and deeper reviews.'
                    : 'Unlimited paths, exam mode, and deeper reviews — all unlocked.'}
                </div>
                {isFree ? (
                  <Link
                    href="/pricing"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      marginTop: 16,
                      background: '#fff',
                      color: '#7c5cff',
                      fontWeight: 700,
                      fontSize: 13.5,
                      padding: '8px 20px',
                      borderRadius: 999,
                      textDecoration: 'none',
                    }}
                  >
                    Upgrade
                  </Link>
                ) : (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      marginTop: 16,
                      background: '#fff',
                      color: '#7c5cff',
                      fontWeight: 700,
                      fontSize: 13.5,
                      padding: '8px 18px',
                      borderRadius: 999,
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#7c5cff' }} aria-hidden>
                      verified
                    </span>
                    Pro member
                  </span>
                )}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/mascot/holding-wand-v2.png"
                  alt=""
                  style={{ position: 'absolute', right: 6, bottom: 0, width: 96, height: 96, objectFit: 'contain', pointerEvents: 'none' }}
                />
            </div>

            <div className={styles.settings} style={{ marginTop: 20 }}>
              {SETTINGS.map((s) => (
                <Link key={s.label} href={s.href} className={styles.setRow}>
                  <span className={styles.setIcon}>
                    <MsIcon name={s.icon} size={18} />
                  </span>
                  <span className={styles.setLabel}>{s.label}</span>
                  <span className={styles.setChevron}>
                    <MsIcon name="chevron_right" size={20} />
                  </span>
                </Link>
              ))}
            </div>

            <button
              type="button"
              className={styles.logout}
              onClick={() => signOut({ callbackUrl: '/' })}
            >
              Log out
            </button>
          </div>
        </div>
      </div>

      {/* ── Modals mounted at root ── */}

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
          const d = json?.data ?? json;
          if (d?.id) setProfile(d);
          await updateSession();
        }}
      />

      {/* Shared interaction styles — focus rings, reduced-motion fallbacks */}
      <style>{`
        .hl-input, .hl-textarea {
          transition: border-color 0.15s ease;
        }
        .hl-input:focus-visible, .hl-textarea:focus-visible {
          outline: 2px solid var(--primary);
          outline-offset: 2px;
          border-color: var(--primary);
        }
        .hl-input:disabled, .hl-textarea:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
        .hl-action-btn {
          transition: transform 0.18s cubic-bezier(0.22,1,0.36,1),
                      background-color 0.18s cubic-bezier(0.22,1,0.36,1);
          outline: none;
        }
        .hl-action-btn:hover:not(:disabled) { transform: scale(1.02); }
        .hl-action-btn:focus-visible {
          outline: 2px solid var(--primary);
          outline-offset: 2px;
        }
        .hl-ghost-btn {
          transition: background-color 0.18s cubic-bezier(0.22,1,0.36,1);
          outline: none;
        }
        .hl-ghost-btn:focus-visible {
          outline: 2px solid var(--primary);
          outline-offset: 2px;
        }
        @keyframes hl-spin {
          to { transform: rotate(360deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          .hl-input, .hl-textarea, .hl-action-btn, .hl-ghost-btn {
            transition: none !important;
          }
          .hl-action-btn:hover { transform: none !important; }
        }
      `}</style>
    </AppShell>
  );
}

// ── Edit profile modal ──────────────────────────────────────────────────────

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
  form, setForm, saving, saveError, onCancel, onSave,
  onChangePhoto, onChangeUsername, isPhone,
}: EditProfileModalProps) {
  const dims = useModalDimensions(560);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [saving, onCancel]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="hl-edit-profile-title"
      onClick={(e) => { if (e.target === e.currentTarget && !saving) onCancel(); }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 300,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(8px)',
        padding: isPhone ? 0 : 16,
      }}
    >
      <div
        style={{
          ...dims,
          background: 'var(--surface)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
          border: '1px solid var(--border)',
        }}
      >
        {/* Header */}
        <div
          style={{
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: isPhone ? '18px 20px' : '22px 28px',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <h2
            id="hl-edit-profile-title"
            style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--ink)' }}
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
              color: 'var(--body)',
              cursor: 'pointer',
              padding: 4,
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 22 }}>close</span>
          </button>
        </div>

        {/* Scrollable body */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            padding: isPhone ? '20px' : '24px 28px',
            display: 'flex',
            flexDirection: 'column',
            gap: isPhone ? 16 : 20,
          }}
        >
          {/* Photo + Handle quick actions */}
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              onClick={onChangePhoto}
              className="hl-ghost-btn"
              style={{
                flex: 1,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                padding: '10px 12px',
                background: 'var(--lilac-soft)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                color: 'var(--accent)',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
                whiteSpace: 'nowrap',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>photo_camera</span>
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
                gap: 6,
                padding: '10px 12px',
                background: 'var(--lilac-soft)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                color: 'var(--accent)',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
                whiteSpace: 'nowrap',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>alternate_email</span>
              Handle
            </button>
          </div>

          <ModalField label="Name">
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              maxLength={100}
              placeholder="Your full name"
              className="hl-input"
              style={INPUT_STYLE}
            />
          </ModalField>

          <ModalField label="Bio" helper={`${form.bio.length}/160`}>
            <textarea
              value={form.bio}
              onChange={(e) => setForm({ ...form, bio: e.target.value })}
              maxLength={160}
              placeholder="Write a short description about yourself"
              rows={3}
              className="hl-textarea"
              style={{ ...INPUT_STYLE, resize: 'vertical', minHeight: 72 }}
            />
          </ModalField>

          {/* Privacy toggles */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 18 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', margin: '0 0 12px' }}>
              Privacy
            </h3>
            <ToggleRow
              icon="lock"
              title="Private profile"
              description="Only friends can see your full profile"
              checked={form.profilePrivate}
              onChange={(next) => setForm({ ...form, profilePrivate: next })}
            />
            <div style={{ height: 10 }} />
            <ToggleRow
              icon="visibility_off"
              title="Hide achievements"
              description="Others cannot see your achievements"
              checked={form.hideAchievements}
              onChange={(next) => setForm({ ...form, hideAchievements: next })}
            />
          </div>
        </div>

        {/* Sticky footer */}
        <div
          style={{
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            padding: isPhone ? '16px 20px' : '18px 28px',
            borderTop: '1px solid var(--border)',
          }}
        >
          {saveError && (
            <div
              role="alert"
              style={{
                background: 'rgba(207,34,46,0.08)',
                border: '1px solid rgba(207,34,46,0.4)',
                color: '#cf222e',
                borderRadius: 12,
                padding: '12px 16px',
                fontSize: 13,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>error</span>
              {saveError}
            </div>
          )}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onCancel}
              disabled={saving}
              className="hl-ghost-btn"
              style={{
                padding: '10px 20px',
                background: 'transparent',
                color: 'var(--body)',
                borderRadius: 12,
                border: '1px solid var(--border)',
                fontSize: 14,
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
                background: 'var(--primary)',
                color: '#fff',
                borderRadius: 12,
                border: 'none',
                fontSize: 14,
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

// ── Username modal ──────────────────────────────────────────────────────────

interface UsernameModalProps {
  usernameInput: string;
  usernameStatus: UsernameStatus;
  usernameMessage: string;
  modalSaving: boolean;
  modalError: string;
  isPhone: boolean;
  onUsernameChange: (v: string) => void;
  onPhotoChange: () => void;
  onClose: () => void;
  onSave: () => void;
}

function UsernameModal({
  usernameInput, usernameStatus, usernameMessage,
  modalSaving, modalError, isPhone,
  onUsernameChange, onPhotoChange, onClose, onSave,
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
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(8px)',
        padding: 16,
      }}
      onClick={(e) => { if (e.target === e.currentTarget && !modalSaving) onClose(); }}
    >
      <div
        style={{
          background: 'var(--surface)',
          borderRadius: 18,
          padding: isPhone ? '22px 20px' : '28px 32px',
          display: 'flex',
          flexDirection: 'column',
          gap: isPhone ? 18 : 22,
          maxWidth: 420,
          width: '100%',
          boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
          border: '1px solid var(--border)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2
            id="hl-username-modal-title"
            style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--ink)' }}
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
              color: 'var(--body)',
              cursor: 'pointer',
              padding: 4,
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>close</span>
          </button>
        </div>

        {/* Photo row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>Profile photo</span>
          <button
            type="button"
            onClick={onPhotoChange}
            className="hl-ghost-btn"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 14px',
              background: 'var(--lilac-soft)',
              color: 'var(--accent)',
              borderRadius: 12,
              border: '1px solid var(--border)',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>photo_camera</span>
            Change
          </button>
        </div>

        {/* Username field */}
        <div>
          <label
            htmlFor="hl-username-input"
            style={{ fontSize: 12, fontWeight: 500, color: 'var(--body)', marginBottom: 6, display: 'block' }}
          >
            Username
          </label>
          <div style={{ position: 'relative' }}>
            <span
              aria-hidden
              style={{
                position: 'absolute',
                left: 14,
                top: '50%',
                transform: 'translateY(-50%)',
                fontSize: 14,
                color: 'var(--body)',
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
              style={{ ...INPUT_STYLE, paddingLeft: 32, paddingRight: 40 }}
            />
            <div
              style={{
                position: 'absolute',
                right: 12,
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
                  style={{ fontSize: 18, color: 'var(--body)', animation: 'hl-spin 1s linear infinite' }}
                >
                  progress_activity
                </span>
              )}
              {usernameStatus === 'available' && (
                <span
                  className="material-symbols-outlined"
                  aria-label="Available"
                  style={{ fontSize: 18, color: 'var(--success, #2da44e)', fontVariationSettings: "'FILL' 1" }}
                >
                  check_circle
                </span>
              )}
              {(usernameStatus === 'taken' || usernameStatus === 'invalid') && (
                <span
                  className="material-symbols-outlined"
                  aria-label={usernameStatus === 'taken' ? 'Taken' : 'Invalid'}
                  style={{ fontSize: 18, color: '#cf222e', fontVariationSettings: "'FILL' 1" }}
                >
                  cancel
                </span>
              )}
            </div>
          </div>
          <p
            style={{
              margin: '6px 0 0 4px',
              fontSize: 12,
              color: usernameStatus === 'available'
                ? 'var(--success, #2da44e)'
                : usernameStatus === 'taken' || usernameStatus === 'invalid'
                  ? '#cf222e'
                  : 'var(--body)',
              minHeight: '1lh',
            }}
          >
            {usernameStatus === 'available' || usernameStatus === 'taken' || usernameStatus === 'invalid'
              ? usernameMessage
              : '3–20 chars, letters, numbers, underscores'}
          </p>
        </div>

        {modalError && (
          <p role="alert" style={{ margin: 0, fontSize: 13, color: '#cf222e' }}>{modalError}</p>
        )}

        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
            disabled={modalSaving}
            className="hl-ghost-btn"
            style={{
              padding: '10px 20px',
              background: 'transparent',
              color: 'var(--body)',
              borderRadius: 12,
              border: '1px solid var(--border)',
              fontSize: 14,
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
              background: 'var(--primary)',
              color: '#fff',
              borderRadius: 12,
              border: 'none',
              fontSize: 14,
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

// ── Shared form helpers ─────────────────────────────────────────────────────

function ModalField({ label, helper, children }: {
  label: string; helper?: string; children: React.ReactNode;
}) {
  return (
    <div>
      <label
        style={{ fontSize: 12, fontWeight: 500, color: 'var(--body)', marginBottom: 6, display: 'block' }}
      >
        {label}
      </label>
      {children}
      {helper && (
        <p style={{ fontSize: 11, color: 'var(--body)', margin: '4px 0 0', textAlign: 'right', minHeight: '1lh' }}>
          {helper}
        </p>
      )}
    </div>
  );
}

function ToggleRow({ icon, title, description, checked, onChange }: {
  icon: string; title: string; description: string;
  checked: boolean; onChange: (next: boolean) => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 14px',
        background: 'var(--lilac-soft)',
        borderRadius: 12,
        gap: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 20, color: 'var(--accent)', flexShrink: 0 }}>
          {icon}
        </span>
        <div style={{ minWidth: 0 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', margin: 0 }}>{title}</p>
          <p style={{ fontSize: 11, color: 'var(--body)', margin: '2px 0 0' }}>{description}</p>
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={title} />
    </div>
  );
}

// ── Achievements section ─────────────────────────────────────────────────────
// Matches Figma 96:52–96:76: heading + "See all", a featured LATEST card, then a
// row of recent tiles. Cream-shell colors (readable on the light surface), real
// data from /api/user/achievements joined to the ACHIEVEMENTS catalog.

export type UnlockedItem = { badge: string; name?: string; description?: string; icon?: string; unlockedAt?: string };

function achMeta(badge: string) {
  return ACHIEVEMENTS.find((a) => a.badge === badge);
}

function AchievementsSection({ initialUnlocked }: { initialUnlocked: UnlockedItem[] }) {
  // Seeded from SSR (already sorted newest-first); no client fetch.
  const [count] = useState(initialUnlocked.length);
  const [showAll, setShowAll] = useState(false);

  const list = initialUnlocked;
  const latest = list[0] ?? null;
  const lm = latest ? achMeta(latest.badge) : null;
  const latestName = lm?.name ?? latest?.name ?? 'Achievement';
  const latestIcon = lm?.icon ?? latest?.icon ?? 'emoji_events';
  const latestDesc = lm?.description ?? latest?.description ?? 'Unlocked';

  // Tiles: remaining unlocked, then fill to 4 with locked targets (greyed).
  type Tile = { badge: string; name: string; icon: string; locked: boolean };
  const tiles: Tile[] = list.slice(1).map((u) => {
    const m = achMeta(u.badge);
    return { badge: u.badge, name: m?.name ?? u.name ?? '—', icon: m?.icon ?? u.icon ?? 'emoji_events', locked: false };
  });
  if (!showAll) {
    const have = new Set(list.map((u) => u.badge));
    for (const a of ACHIEVEMENTS) {
      if (tiles.length >= 4) break;
      if (!have.has(a.badge)) tiles.push({ badge: a.badge, name: a.name, icon: a.icon, locked: true });
    }
  }
  const shown = showAll ? tiles : tiles.slice(0, 4);

  return (
    <div style={{ marginTop: 26 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, color: 'var(--ink)' }}>
          Achievements
        </h2>
        {count > 0 && (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600, color: 'var(--accent)' }}
          >
            {showAll ? 'Show less' : 'See all'}
          </button>
        )}
      </div>

      {/* LATEST featured card */}
      {latest ? (
        <div
          style={{
            marginTop: 14,
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            background: '#f4f1ff',
            border: '1.4px solid #cbb9ff',
            borderRadius: 18,
            boxShadow: '0 6px 18px rgba(124,92,255,0.10)',
            padding: '18px 20px',
          }}
        >
          <span style={{ width: 48, height: 48, borderRadius: 999, background: '#e7deff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 26, color: 'var(--accent)' }} aria-hidden>{latestIcon}</span>
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--accent)' }}>LATEST</div>
            <div style={{ marginTop: 2, fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>{latestName}</div>
            <div style={{ marginTop: 3, fontSize: 13.5, color: 'var(--body)' }}>{latestDesc}</div>
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 14, background: '#f4f1ff', border: '1.4px solid #cbb9ff', borderRadius: 18, padding: 20, textAlign: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>No achievements yet</div>
          <div style={{ marginTop: 4, fontSize: 13, color: 'var(--body)' }}>Keep studying to earn your first.</div>
        </div>
      )}

      {/* Tiles */}
      {shown.length > 0 && (
        <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 14 }}>
          {shown.map((t) => (
            <div
              key={t.badge}
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 16,
                boxShadow: 'var(--shadow)',
                padding: '16px 8px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 10,
                opacity: t.locked ? 0.45 : 1,
              }}
            >
              <span style={{ width: 48, height: 48, borderRadius: 999, background: 'var(--lilac)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 24, color: 'var(--accent)' }} aria-hidden>{t.icon}</span>
              </span>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', textAlign: 'center', lineHeight: 1.2 }}>{t.name}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
