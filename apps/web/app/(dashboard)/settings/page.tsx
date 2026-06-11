'use client';

import { useSession, signOut } from 'next-auth/react';
import { useState, useEffect, useRef, useCallback } from 'react';
import AvatarEditor from '@/components/ui/AvatarEditor';
import SubscriptionPanel from '@/components/settings/SubscriptionPanel';
import ThemeToggle from '@/components/ui/ThemeToggle';
import { useTheme } from '@/contexts/ThemeContext';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { useTutorial } from '@/components/tutorial/TutorialContext';
import {
  GOAL_CONFIGS,
  EMPTY_GOAL_VALUES,
  type GoalKey,
  type GoalValues,
} from '@/components/onboarding/StudyGoalsStep';

function getInitials(name?: string | null): string {
  if (!name) return '?';
  return name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

type Section = 'account' | 'appearance' | 'notifications' | 'goals' | 'subscription' | 'privacy';

function Toggle({
  checked,
  onChange,
  ariaLabel,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => onChange(!checked)}
      style={{
        position: 'relative',
        width: '56px',
        height: '32px',
        borderRadius: '9999px',
        background: checked ? 'var(--brand-purple)' : 'var(--surface-container-highest)',
        border: 'none',
        cursor: 'pointer',
        flexShrink: 0,
        transition: 'background 0.2s cubic-bezier(0.22,1,0.36,1)',
        padding: 0,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: '4px',
          left: '4px',
          width: '24px',
          height: '24px',
          borderRadius: '50%',
          background: '#ffffff',
          transform: checked ? 'translateX(24px)' : 'translateX(0)',
          transition: 'transform 0.2s cubic-bezier(0.22,1,0.36,1)',
          display: 'block',
        }}
      />
    </button>
  );
}

export default function SettingsPage() {
  const { data: session, update: updateSession } = useSession();
  const { isPhone } = useBreakpoint();
  const { preference: themePreference, resolved: resolvedTheme } = useTheme();
  const { restart: restartTutorial } = useTutorial();
  // Phone: null = drill-in root list (profile + section rows). Desktop always shows a section.
  const [activeSection, setActiveSection] = useState<Section | null>(null);
  const visibleSection: Section | null = isPhone ? activeSection : (activeSection ?? 'account');
  const backBtnRef = useRef<HTMLButtonElement>(null);
  const lastSectionRef = useRef<Section | null>(null);

  const enterSection = (section: Section) => {
    if (isPhone) {
      window.history.pushState({ nmSettings: section }, '');
      lastSectionRef.current = section;
    }
    setActiveSection(section);
    if (isPhone) {
      document.querySelector('main')?.scrollTo(0, 0);
      window.scrollTo(0, 0);
      requestAnimationFrame(() => backBtnRef.current?.focus({ preventScroll: true }));
    }
  };

  const drillOut = useCallback(() => {
    setActiveSection(null);
    document.querySelector('main')?.scrollTo(0, 0);
    const last = lastSectionRef.current;
    if (last) {
      requestAnimationFrame(() =>
        document.getElementById(`settings-row-${last}`)?.focus({ preventScroll: true })
      );
    }
  }, []);

  const exitSection = () => {
    // Prefer history.back() so the browser back button and the in-app back
    // button share one exit path; popstate below performs the actual drill-out.
    if (isPhone && window.history.state?.nmSettings) {
      window.history.back();
    } else {
      drillOut();
    }
  };

  useEffect(() => {
    window.addEventListener('popstate', drillOut);
    return () => window.removeEventListener('popstate', drillOut);
  }, [drillOut]);

  const [notifications, setNotifications] = useState({
    studyReminders: true,
    productUpdates: true,
    weeklyReport: false,
  });

  const [quizReactionsMode, setQuizReactionsMode] = useState<'all' | 'minimal' | 'off'>('all');
  const [quizReactionsAudio, setQuizReactionsAudio] = useState(false);

  const [studyGoals, setStudyGoals] = useState<GoalValues>({ ...EMPTY_GOAL_VALUES });
  const [goalCustomInputs, setGoalCustomInputs] = useState<Record<string, string>>({});
  const [goalStatus, setGoalStatus] = useState<{ type: 'error' | 'success'; msg: string } | null>(
    null
  );
  const [goalLoading, setGoalLoading] = useState(false);

  // Custom greeting state
  const [customGreeting, setCustomGreeting] = useState('');
  const [greetingLoading, setGreetingLoading] = useState(false);
  const [greetingStatus, setGreetingStatus] = useState<{
    type: 'error' | 'success';
    msg: string;
  } | null>(null);

  // Mage name state
  const [mageNameInput, setMageNameInput] = useState('');
  const [mageNameLoading, setMageNameLoading] = useState(false);
  const [mageNameStatus, setMageNameStatus] = useState<{
    type: 'error' | 'success';
    msg: string;
  } | null>(null);

  useEffect(() => {
    fetch('/api/user/profile')
      .then((r) => r.json())
      .then((res) => {
        if (res?.data?.customGreeting) {
          setCustomGreeting(res.data.customGreeting);
        }
        if (res?.data?.scholarName) {
          setMageNameInput(res.data.scholarName);
        }
      })
      .catch(() => {});
  }, []);

  // Notification preferences are a device-local choice for now (no server field
  // yet), persisted so they survive reloads instead of resetting every visit.
  useEffect(() => {
    try {
      const raw = localStorage.getItem('notemage:notification-prefs');
      if (!raw) return;
      const saved = JSON.parse(raw) as Partial<Record<string, unknown>>;
      setNotifications((n) => ({
        studyReminders:
          typeof saved.studyReminders === 'boolean' ? saved.studyReminders : n.studyReminders,
        productUpdates:
          typeof saved.productUpdates === 'boolean' ? saved.productUpdates : n.productUpdates,
        weeklyReport: typeof saved.weeklyReport === 'boolean' ? saved.weeklyReport : n.weeklyReport,
      }));
    } catch {
      /* ignore malformed or blocked storage */
    }
  }, []);

  const handleGreetingSave = async () => {
    setGreetingLoading(true);
    setGreetingStatus(null);
    try {
      const value = customGreeting.trim() || null;
      const res = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customGreeting: value }),
      });
      if (res.ok) {
        setGreetingStatus({
          type: 'success',
          msg: value ? 'Custom greeting saved!' : 'Reset to random greetings.',
        });
        if (!value) setCustomGreeting('');
      } else {
        const json = await res.json();
        setGreetingStatus({ type: 'error', msg: json.error || 'Failed to save.' });
      }
    } catch {
      setGreetingStatus({ type: 'error', msg: 'Network error. Try again.' });
    }
    setGreetingLoading(false);
  };

  const handleMageNameSave = async () => {
    setMageNameLoading(true);
    setMageNameStatus(null);
    try {
      const value = mageNameInput.trim() || null;
      const res = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scholarName: value }),
      });
      if (res.ok) {
        setMageNameStatus({
          type: 'success',
          msg: value ? 'Mage name saved!' : 'Reset to default "Mage".',
        });
        if (!value) setMageNameInput('');
        await updateSession();
      } else {
        const json = await res.json();
        setMageNameStatus({ type: 'error', msg: json.error || 'Failed to save.' });
      }
    } catch {
      setMageNameStatus({ type: 'error', msg: 'Network error. Try again.' });
    }
    setMageNameLoading(false);
  };

  useEffect(() => {
    fetch('/api/user/study-goals')
      .then((r) => r.json())
      .then((res) => {
        const d = res?.data ?? res;
        if (d && typeof d === 'object') {
          setStudyGoals({
            dailyStudyMinutesGoal: d.dailyStudyMinutesGoal ?? null,
            weeklyStudyPlansGoal: d.weeklyStudyPlansGoal ?? null,
            weeklyNotesGoal: d.weeklyNotesGoal ?? null,
            weeklyChatsGoal: d.weeklyChatsGoal ?? null,
          });
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch('/api/user/settings')
      .then((r) => r.json())
      .then((res) => {
        const d = res?.data ?? res;
        if (d && typeof d === 'object') {
          if (
            d.quizReactionsMode === 'all' ||
            d.quizReactionsMode === 'minimal' ||
            d.quizReactionsMode === 'off'
          ) {
            setQuizReactionsMode(d.quizReactionsMode);
          }
          if (typeof d.quizReactionsAudio === 'boolean') {
            setQuizReactionsAudio(d.quizReactionsAudio);
          }
        }
      })
      .catch(() => {});
  }, []);

  const saveQuizReactionsMode = async (mode: 'all' | 'minimal' | 'off') => {
    const previous = quizReactionsMode;
    setQuizReactionsMode(mode);
    try {
      const res = await fetch('/api/user/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quizReactionsMode: mode }),
      });
      if (!res.ok) setQuizReactionsMode(previous);
    } catch {
      setQuizReactionsMode(previous);
    }
  };

  const saveQuizReactionsAudio = async (audio: boolean) => {
    const previous = quizReactionsAudio;
    setQuizReactionsAudio(audio);
    try {
      const res = await fetch('/api/user/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quizReactionsAudio: audio }),
      });
      if (!res.ok) setQuizReactionsAudio(previous);
    } catch {
      setQuizReactionsAudio(previous);
    }
  };

  const toggleStudyGoal = (config: (typeof GOAL_CONFIGS)[number]) => {
    setStudyGoals((prev) => ({
      ...prev,
      [config.key]: prev[config.key] === null ? config.presets[1] : null,
    }));
  };

  const setStudyGoalTarget = (key: GoalKey, target: number) => {
    setStudyGoals((prev) => ({ ...prev, [key]: target }));
  };

  const handleGoalCustomInput = (config: (typeof GOAL_CONFIGS)[number], value: string) => {
    setGoalCustomInputs((prev) => ({ ...prev, [config.key]: value }));
    const num = parseInt(value, 10);
    if (!isNaN(num) && num >= config.min && num <= config.max) {
      setStudyGoalTarget(config.key, num);
    }
  };

  const handleGoalSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setGoalLoading(true);
    setGoalStatus(null);
    try {
      const res = await fetch('/api/user/study-goals', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(studyGoals),
      });
      if (res.ok) {
        setGoalStatus({ type: 'success', msg: 'Study goals updated!' });
      } else {
        setGoalStatus({ type: 'error', msg: 'Failed to save. Try again.' });
      }
    } catch {
      setGoalStatus({ type: 'error', msg: 'Network error. Try again.' });
    }
    setGoalLoading(false);
  };

  // Avatar editor state
  const [avatarEditorOpen, setAvatarEditorOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  const [passwords, setPasswords] = useState({ current: '', newPass: '', confirm: '' });
  const [pwStatus, setPwStatus] = useState<{ type: 'error' | 'success'; msg: string } | null>(null);
  const [pwLoading, setPwLoading] = useState(false);

  const handlePasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwords.newPass !== passwords.confirm) {
      setPwStatus({ type: 'error', msg: 'New passwords do not match' });
      return;
    }
    if (passwords.newPass.length < 8) {
      setPwStatus({ type: 'error', msg: 'Password must be at least 8 characters' });
      return;
    }
    setPwLoading(true);
    setPwStatus(null);
    try {
      const res = await fetch('/api/user/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: passwords.current,
          newPassword: passwords.newPass,
        }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok) {
        setPwStatus({ type: 'success', msg: 'Password updated.' });
        setPasswords({ current: '', newPass: '', confirm: '' });
      } else {
        setPwStatus({
          type: 'error',
          msg: json?.error ?? "Couldn't update password. Please try again.",
        });
      }
    } catch {
      setPwStatus({ type: 'error', msg: 'Network error. Please try again.' });
    } finally {
      setPwLoading(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '16px 20px',
    background: 'var(--surface-container-high)',
    border: 'none',
    borderRadius: '16px',
    color: 'var(--on-surface)',
    fontSize: '15px',
    fontFamily: 'inherit',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'box-shadow 0.2s cubic-bezier(0.22,1,0.36,1)',
  };

  const navItems: { section: Section; icon: string; label: string }[] = [
    { section: 'account', icon: 'person', label: 'Account Details' },
    { section: 'appearance', icon: 'palette', label: 'Appearance' },
    { section: 'notifications', icon: 'notifications_active', label: 'Notifications' },
    { section: 'goals', icon: 'track_changes', label: 'Study Goals' },
    { section: 'subscription', icon: 'credit_card', label: 'Subscription' },
    { section: 'privacy', icon: 'lock', label: 'Privacy & Security' },
  ];

  return (
    <div
      style={{
        maxWidth: '1280px',
        margin: '0 auto',
        position: 'relative',
        padding: isPhone ? '0 16px' : undefined,
        overflow: 'hidden',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      {/* Ambient bg blobs */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          width: '600px',
          height: '600px',
          background: 'rgba(174,137,255,0.05)',
          filter: 'blur(120px)',
          borderRadius: '50%',
          zIndex: 0,
          transform: 'translate(50%, -50%)',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: '256px',
          width: '400px',
          height: '400px',
          background: 'rgba(185,195,255,0.05)',
          filter: 'blur(100px)',
          borderRadius: '50%',
          zIndex: 0,
          transform: 'translate(-50%, 50%)',
          pointerEvents: 'none',
        }}
      />

      {isPhone && (
        <style>{`
          .settings-view-enter { animation: settingsViewIn 0.18s cubic-bezier(0.22,1,0.36,1); }
          .settings-view-enter-back { animation: settingsViewInBack 0.18s cubic-bezier(0.22,1,0.36,1); }
          @keyframes settingsViewIn { from { opacity: 0; transform: translateX(16px); } to { opacity: 1; transform: none; } }
          @keyframes settingsViewInBack { from { opacity: 0; transform: translateX(-16px); } to { opacity: 1; transform: none; } }
          @media (prefers-reduced-motion: reduce) {
            .settings-view-enter, .settings-view-enter-back { animation: none; }
          }
        `}</style>
      )}

      {/* Page header — on phone the detail view supplies its own back header */}
      {(!isPhone || activeSection === null) && (
        <header style={{ marginBottom: isPhone ? '24px' : '48px' }}>
          <h2
            style={{
              fontFamily: 'var(--font-brand)',
              fontSize: isPhone ? '32px' : '48px',
              fontWeight: 400,
              color: 'var(--md-h4)',
              margin: '0 0 8px',
              letterSpacing: '-0.02em',
            }}
          >
            Settings
          </h2>
        </header>
      )}

      <div
        style={{
          display: isPhone ? 'flex' : 'grid',
          flexDirection: isPhone ? 'column' : undefined,
          gridTemplateColumns: isPhone ? undefined : 'minmax(0, 1fr) minmax(0, 2fr)',
          gap: isPhone ? '16px' : '32px',
          alignItems: isPhone ? 'stretch' : 'start',
          position: 'relative',
          zIndex: 1,
          overflow: 'hidden',
        }}
      >
        {/* Left column — on phone this is the drill-in root view */}
        {(!isPhone || activeSection === null) && (
        <div
          key={isPhone ? 'settings-root' : undefined}
          className={isPhone ? 'settings-view-enter-back' : undefined}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: isPhone ? '16px' : '24px',
            minWidth: 0,
          }}
        >
          {/* Profile card */}
          <div
            style={{
              background: 'var(--surface-container-low)',
              borderRadius: isPhone ? '20px' : '32px',
              padding: isPhone ? '20px' : '32px',
              display: 'flex',
              flexDirection: 'column',
              gap: isPhone ? '16px' : '24px',
            }}
          >
            {/* Avatar + name */}
            <div
              style={{
                display: 'flex',
                flexDirection: isPhone ? 'row' : 'column',
                alignItems: 'center',
                textAlign: isPhone ? 'left' : 'center',
                gap: isPhone ? '12px' : '16px',
              }}
            >
              <div style={{ position: 'relative', flexShrink: 0 }}>
                {session?.user?.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={session.user.avatarUrl}
                    alt={session.user.name || 'Avatar'}
                    style={{
                      width: isPhone ? '64px' : '96px',
                      height: isPhone ? '64px' : '96px',
                      borderRadius: isPhone ? '16px' : '24px',
                      objectFit: 'cover',
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: isPhone ? '64px' : '96px',
                      height: isPhone ? '64px' : '96px',
                      borderRadius: isPhone ? '16px' : '24px',
                      background: 'var(--brand-purple)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: isPhone ? '24px' : '32px',
                      fontWeight: 700,
                      color: 'var(--on-primary)',
                      letterSpacing: '-0.01em',
                    }}
                  >
                    {getInitials(session?.user?.name)}
                  </div>
                )}
                <button
                  onClick={() => setAvatarEditorOpen(true)}
                  style={{
                    position: 'absolute',
                    bottom: isPhone ? '-4px' : '-8px',
                    right: isPhone ? '-4px' : '-8px',
                    background: 'var(--brand-purple)',
                    color: 'var(--on-primary)',
                    border: 'none',
                    borderRadius: isPhone ? '8px' : '12px',
                    width: isPhone ? '24px' : '32px',
                    height: isPhone ? '24px' : '32px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                    transition: 'transform 0.2s cubic-bezier(0.22,1,0.36,1)',
                  }}
                  onMouseDown={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.9)';
                  }}
                  onMouseUp={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
                  }}
                >
                  <span
                    className="material-symbols-outlined"
                    style={{ fontSize: isPhone ? '13px' : '16px' }}
                  >
                    edit
                  </span>
                </button>
              </div>
              <div>
                <h3
                  style={{
                    fontSize: '18px',
                    fontWeight: 700,
                    color: 'var(--on-surface)',
                    margin: '0 0 4px',
                  }}
                >
                  {session?.user?.name ?? 'Mage'}
                </h3>
                {session?.user?.username && (
                  <p
                    style={{
                      fontSize: '13px',
                      color: 'var(--on-surface-variant)',
                      fontWeight: 500,
                      margin: 0,
                    }}
                  >
                    @{session.user.username}
                  </p>
                )}
              </div>
            </div>

            {/* Settings nav — vertical list on every breakpoint; phone rows drill in */}
            <nav
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
              }}
            >
              {navItems.map(({ section, icon, label }) => {
                const active = visibleSection === section;
                return (
                  <button
                    key={section}
                    id={`settings-row-${section}`}
                    onClick={() => enterSection(section)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      width: '100%',
                      minHeight: isPhone ? '52px' : undefined,
                      padding: isPhone ? '12px 8px' : '12px 16px',
                      borderRadius: '12px',
                      border: 'none',
                      background: active ? 'rgba(174,137,255,0.1)' : 'transparent',
                      color: active
                        ? 'var(--md-h4)'
                        : isPhone
                          ? 'var(--on-surface)'
                          : 'var(--on-surface-variant)',
                      fontWeight: active ? 700 : 500,
                      fontSize: '15px',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      textAlign: 'left',
                      transition: 'background 0.15s, color 0.15s',
                    }}
                    onMouseEnter={(e) => {
                      if (!active) {
                        (e.currentTarget as HTMLButtonElement).style.background =
                          'rgba(35,35,60,0.3)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!active) {
                        (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                      }
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
                      {icon}
                    </span>
                    {label}
                    {isPhone && (
                      <span
                        className="material-symbols-outlined"
                        style={{
                          fontSize: '20px',
                          color: 'var(--on-surface-variant)',
                          marginLeft: 'auto',
                        }}
                      >
                        chevron_right
                      </span>
                    )}
                  </button>
                );
              })}

              {/* Phone: Delete Account lives as the danger row at the bottom of the root list */}
              {isPhone && (
                <button
                  onClick={() => setDeleteConfirmOpen(true)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    width: '100%',
                    minHeight: '52px',
                    padding: '12px 8px',
                    borderRadius: '12px',
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--error)',
                    fontWeight: 600,
                    fontSize: '15px',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    textAlign: 'left',
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
                    delete_forever
                  </span>
                  Delete Account
                </button>
              )}
            </nav>
          </div>
        </div>
        )}

        {/* Right column — on phone this is the drill-in detail view */}
        {(!isPhone || activeSection !== null) && (
        <div
          key={isPhone ? (activeSection ?? 'detail') : undefined}
          className={isPhone ? 'settings-view-enter' : undefined}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: isPhone ? '16px' : '24px',
            minWidth: 0,
          }}
        >
          {/* Phone back header */}
          {isPhone && activeSection !== null && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', minHeight: '44px' }}>
              <button
                ref={backBtnRef}
                onClick={exitSection}
                aria-label="Back to settings"
                style={{
                  width: '44px',
                  height: '44px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'transparent',
                  border: 'none',
                  borderRadius: '12px',
                  color: 'var(--on-surface)',
                  cursor: 'pointer',
                  padding: 0,
                  marginLeft: '-10px',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '24px' }}>
                  arrow_back
                </span>
              </button>
              <h3
                style={{
                  fontFamily: 'var(--font-brand)',
                  fontSize: '22px',
                  fontWeight: 400,
                  color: 'var(--md-h4)',
                  margin: 0,
                  letterSpacing: '-0.01em',
                }}
              >
                {navItems.find((n) => n.section === activeSection)?.label}
              </h3>
            </div>
          )}
          {/* Account Security */}
          <section
            style={{
              background: 'var(--surface-container)',
              borderRadius: isPhone ? '20px' : '32px',
              padding: isPhone ? '20px' : '32px',
              display:
                visibleSection === 'account' || visibleSection === 'privacy' ? 'flex' : 'none',
              flexDirection: 'column',
              gap: '32px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '16px',
                  background: 'rgba(174,137,255,0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ color: 'var(--md-h4)', fontSize: '24px' }}
                >
                  fingerprint
                </span>
              </div>
              <h3
                style={{ fontSize: '22px', fontWeight: 700, color: 'var(--on-surface)', margin: 0 }}
              >
                Account Security
              </h3>
            </div>

            {/* Email row */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: isPhone ? '1fr' : '1fr auto',
                gap: '16px',
                alignItems: isPhone ? 'stretch' : 'end',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label
                  htmlFor="settings-email"
                  style={{
                    fontSize: '13px',
                    fontWeight: 700,
                    color: 'var(--on-surface-variant)',
                    paddingLeft: '4px',
                  }}
                >
                  Email Address
                </label>
                <input
                  id="settings-email"
                  type="email"
                  value={session?.user?.email ?? ''}
                  readOnly
                  style={{ ...inputStyle, color: 'var(--on-surface-variant)' }}
                />
              </div>
              <button
                type="button"
                disabled
                aria-disabled="true"
                title="Email changes aren't available yet"
                style={{
                  padding: '16px 24px',
                  background: 'var(--surface-container-highest)',
                  border: '1px solid var(--outline-variant)',
                  borderRadius: '16px',
                  color: 'var(--on-surface-variant)',
                  fontWeight: 700,
                  fontSize: '14px',
                  cursor: 'not-allowed',
                  opacity: 0.6,
                  fontFamily: 'inherit',
                  whiteSpace: 'nowrap',
                }}
              >
                Change Email
              </button>
            </div>
            <p
              style={{
                fontSize: '12px',
                color: 'var(--on-surface-variant)',
                margin: '-20px 0 0',
                paddingLeft: '4px',
              }}
            >
              Email changes are not available yet.
            </p>

            {/* Change Password */}
            <div style={{ paddingTop: '24px', borderTop: '1px solid rgba(70,69,96,0.20)' }}>
              <h4
                style={{
                  fontSize: '16px',
                  fontWeight: 700,
                  color: 'var(--on-surface)',
                  margin: '0 0 24px',
                }}
              >
                Change Password
              </h4>
              <form
                onSubmit={handlePasswordUpdate}
                style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
              >
                {pwStatus && (
                  <div
                    style={{
                      padding: '12px 16px',
                      borderRadius: '12px',
                      background:
                        pwStatus.type === 'error'
                          ? 'rgba(253,111,133,0.12)'
                          : 'rgba(174,137,255,0.12)',
                      color: pwStatus.type === 'error' ? 'var(--error)' : 'var(--md-h4)',
                      fontSize: '14px',
                    }}
                  >
                    {pwStatus.msg}
                  </div>
                )}
                <input
                  type="password"
                  aria-label="Current password"
                  placeholder="Current Password"
                  value={passwords.current}
                  onChange={(e) => setPasswords((p) => ({ ...p, current: e.target.value }))}
                  style={inputStyle}
                  onFocus={(e) => {
                    e.target.style.boxShadow = '0 0 0 2px rgba(174,137,255,0.4)';
                  }}
                  onBlur={(e) => {
                    e.target.style.boxShadow = 'none';
                  }}
                />
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: isPhone ? '1fr' : '1fr 1fr',
                    gap: '16px',
                  }}
                >
                  <input
                    type="password"
                    aria-label="New password"
                    placeholder="New Password"
                    value={passwords.newPass}
                    onChange={(e) => setPasswords((p) => ({ ...p, newPass: e.target.value }))}
                    style={inputStyle}
                    onFocus={(e) => {
                      e.target.style.boxShadow = '0 0 0 2px rgba(174,137,255,0.4)';
                    }}
                    onBlur={(e) => {
                      e.target.style.boxShadow = 'none';
                    }}
                  />
                  <input
                    type="password"
                    aria-label="Confirm new password"
                    placeholder="Confirm New Password"
                    value={passwords.confirm}
                    onChange={(e) => setPasswords((p) => ({ ...p, confirm: e.target.value }))}
                    style={inputStyle}
                    onFocus={(e) => {
                      e.target.style.boxShadow = '0 0 0 2px rgba(174,137,255,0.4)';
                    }}
                    onBlur={(e) => {
                      e.target.style.boxShadow = 'none';
                    }}
                  />
                </div>
                <button
                  type="submit"
                  disabled={pwLoading}
                  style={{
                    alignSelf: 'flex-start',
                    padding: '14px 32px',
                    background: pwLoading ? 'var(--outline-variant)' : 'var(--brand-purple)',
                    color: pwLoading ? 'var(--on-surface-variant)' : 'var(--on-primary)',
                    border: 'none',
                    borderRadius: '16px',
                    fontWeight: 700,
                    fontSize: '15px',
                    cursor: pwLoading ? 'not-allowed' : 'pointer',
                    fontFamily: 'inherit',
                    boxShadow: pwLoading ? 'none' : '0 8px 24px rgba(174,137,255,0.3)',
                    transition: 'transform 0.2s cubic-bezier(0.22,1,0.36,1)',
                  }}
                  onMouseEnter={(e) => {
                    if (!pwLoading)
                      (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.02)';
                  }}
                  onMouseLeave={(e) => {
                    if (!pwLoading)
                      (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
                  }}
                  onMouseDown={(e) => {
                    if (!pwLoading)
                      (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.97)';
                  }}
                >
                  {pwLoading ? 'Updating…' : 'Update Password'}
                </button>
              </form>
            </div>
          </section>

          {/* Legal & Policies */}
          <section
            style={{
              background: 'var(--surface-container)',
              borderRadius: isPhone ? '20px' : '32px',
              padding: isPhone ? '20px' : '32px',
              display: visibleSection === 'privacy' ? 'flex' : 'none',
              flexDirection: 'column',
              gap: '24px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '16px',
                  background: 'rgba(185,195,255,0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ color: 'var(--secondary)', fontSize: '24px' }}
                >
                  gavel
                </span>
              </div>
              <div>
                <h3
                  style={{
                    fontSize: '22px',
                    fontWeight: 700,
                    color: 'var(--on-surface)',
                    margin: 0,
                  }}
                >
                  Legal &amp; Policies
                </h3>
                <p
                  style={{
                    fontSize: '13px',
                    color: 'var(--on-surface-variant)',
                    margin: '4px 0 0 0',
                  }}
                >
                  Read how we handle your data and the terms you agreed to.
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {[
                { href: '/privacy', icon: 'shield_person', label: 'Privacy Policy' },
                { href: '/terms', icon: 'description', label: 'Terms of Service' },
                { href: '/refund', icon: 'currency_exchange', label: 'Refund Policy' },
                { href: '/legal', icon: 'balance', label: 'Legal Notice' },
              ].map(({ href, icon, label }) => (
                <a
                  key={href}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '14px',
                    padding: '16px',
                    background: 'var(--surface-container-low)',
                    borderRadius: '16px',
                    color: 'var(--on-surface)',
                    textDecoration: 'none',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLAnchorElement).style.background =
                      'var(--card-hover-bg-med)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLAnchorElement).style.background =
                      'var(--surface-container-low)';
                  }}
                >
                  <span
                    className="material-symbols-outlined"
                    style={{ color: 'var(--on-surface-variant)', fontSize: '22px', flexShrink: 0 }}
                  >
                    {icon}
                  </span>
                  <span style={{ fontSize: '15px', fontWeight: 600, flex: 1 }}>{label}</span>
                  <span
                    className="material-symbols-outlined"
                    style={{ color: 'var(--on-surface-variant)', fontSize: '20px', flexShrink: 0 }}
                  >
                    open_in_new
                  </span>
                </a>
              ))}
            </div>
          </section>

          {/* Dashboard Greeting */}
          <section
            style={{
              background: 'var(--surface-container)',
              borderRadius: isPhone ? '20px' : '32px',
              padding: isPhone ? '20px' : '32px',
              display: visibleSection === 'account' ? 'flex' : 'none',
              flexDirection: 'column',
              gap: '24px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '16px',
                  background: 'rgba(240,208,76,0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ color: '#f0d04c', fontSize: '24px' }}
                >
                  waving_hand
                </span>
              </div>
              <div>
                <h3
                  style={{
                    fontSize: '22px',
                    fontWeight: 700,
                    color: 'var(--on-surface)',
                    margin: 0,
                  }}
                >
                  Dashboard Greeting
                </h3>
                <p
                  style={{
                    fontSize: '13px',
                    color: 'var(--on-surface-variant)',
                    margin: '4px 0 0 0',
                  }}
                >
                  Set a custom greeting. Use {'{'}
                  <span style={{ color: 'var(--md-h4)' }}>name</span>
                  {'}'} to include your name.
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <input
                type="text"
                placeholder="e.g. The mighty {name} has arrived!"
                value={customGreeting}
                onChange={(e) => {
                  setCustomGreeting(e.target.value);
                  setGreetingStatus(null);
                }}
                maxLength={120}
                style={inputStyle}
                onFocus={(e) => {
                  e.currentTarget.style.boxShadow = '0 0 0 2px rgba(174,137,255,0.4)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.boxShadow = 'none';
                }}
              />
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                }}
              >
                <span style={{ fontSize: '12px', color: 'var(--on-surface-variant)' }}>
                  {customGreeting.length}/120 &middot; Leave empty for random greetings
                </span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {customGreeting && (
                    <button
                      onClick={async () => {
                        setCustomGreeting('');
                        setGreetingLoading(true);
                        setGreetingStatus(null);
                        try {
                          const res = await fetch('/api/user/profile', {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ customGreeting: null }),
                          });
                          if (res.ok) {
                            setGreetingStatus({
                              type: 'success',
                              msg: 'Reset to random greetings.',
                            });
                          } else {
                            setGreetingStatus({ type: 'error', msg: 'Failed to clear.' });
                          }
                        } catch {
                          setGreetingStatus({ type: 'error', msg: 'Network error.' });
                        }
                        setGreetingLoading(false);
                      }}
                      disabled={greetingLoading}
                      style={{
                        padding: '10px 20px',
                        background: 'transparent',
                        border: '1px solid var(--outline-variant)',
                        borderRadius: '12px',
                        color: 'var(--on-surface-variant)',
                        fontSize: '14px',
                        fontWeight: 600,
                        cursor: greetingLoading ? 'not-allowed' : 'pointer',
                        transition: 'transform 0.2s cubic-bezier(0.22,1,0.36,1)',
                      }}
                    >
                      Clear
                    </button>
                  )}
                  <button
                    onClick={handleGreetingSave}
                    disabled={greetingLoading}
                    style={{
                      padding: '10px 24px',
                      background: greetingLoading ? 'rgba(174,137,255,0.3)' : 'var(--brand-purple)',
                      border: 'none',
                      borderRadius: '12px',
                      color: 'var(--on-primary)',
                      fontSize: '14px',
                      fontWeight: 600,
                      cursor: greetingLoading ? 'not-allowed' : 'pointer',
                      boxShadow: greetingLoading ? 'none' : '0 8px 24px rgba(174,137,255,0.3)',
                      transition: 'transform 0.2s cubic-bezier(0.22,1,0.36,1)',
                    }}
                    onMouseEnter={(e) => {
                      if (!greetingLoading)
                        (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.02)';
                    }}
                    onMouseLeave={(e) => {
                      if (!greetingLoading)
                        (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
                    }}
                  >
                    {greetingLoading ? 'Saving…' : 'Save Greeting'}
                  </button>
                </div>
              </div>
              {greetingStatus && (
                <p
                  style={{
                    fontSize: '14px',
                    color: greetingStatus.type === 'success' ? 'var(--success)' : 'var(--error)',
                    margin: 0,
                  }}
                >
                  {greetingStatus.msg}
                </p>
              )}
            </div>
          </section>

          {/* Mage Name */}
          <section
            style={{
              background: 'var(--surface-container)',
              borderRadius: isPhone ? '20px' : '32px',
              padding: isPhone ? '20px' : '32px',
              display: visibleSection === 'account' ? 'flex' : 'none',
              flexDirection: 'column',
              gap: '24px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '16px',
                  background: 'rgba(174,137,255,0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ color: 'var(--md-h4)', fontSize: '24px' }}
                >
                  auto_awesome
                </span>
              </div>
              <div>
                <h3
                  style={{
                    fontSize: '22px',
                    fontWeight: 700,
                    color: 'var(--on-surface)',
                    margin: 0,
                  }}
                >
                  Mage Name
                </h3>
                <p
                  style={{
                    fontSize: '13px',
                    color: 'var(--on-surface-variant)',
                    margin: '4px 0 0 0',
                  }}
                >
                  Give your AI study assistant a custom name.
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <input
                type="text"
                placeholder="e.g. Archimedes, Sage, Athena…"
                value={mageNameInput}
                onChange={(e) => {
                  setMageNameInput(e.target.value);
                  setMageNameStatus(null);
                }}
                maxLength={30}
                style={inputStyle}
                onFocus={(e) => {
                  e.currentTarget.style.boxShadow = '0 0 0 2px rgba(174,137,255,0.4)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.boxShadow = 'none';
                }}
              />
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                }}
              >
                <span style={{ fontSize: '12px', color: 'var(--on-surface-variant)' }}>
                  {mageNameInput.length}/30 &middot; Leave empty for default &ldquo;Mage&rdquo;
                </span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {mageNameInput && (
                    <button
                      onClick={async () => {
                        setMageNameInput('');
                        setMageNameLoading(true);
                        setMageNameStatus(null);
                        try {
                          const res = await fetch('/api/user/profile', {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ scholarName: null }),
                          });
                          if (res.ok) {
                            setMageNameStatus({ type: 'success', msg: 'Reset to default "Mage".' });
                            await updateSession();
                          } else {
                            setMageNameStatus({ type: 'error', msg: 'Failed to clear.' });
                          }
                        } catch {
                          setMageNameStatus({ type: 'error', msg: 'Network error.' });
                        }
                        setMageNameLoading(false);
                      }}
                      disabled={mageNameLoading}
                      style={{
                        padding: '10px 20px',
                        background: 'transparent',
                        border: '1px solid var(--outline-variant)',
                        borderRadius: '12px',
                        color: 'var(--on-surface-variant)',
                        fontSize: '14px',
                        fontWeight: 600,
                        cursor: mageNameLoading ? 'not-allowed' : 'pointer',
                        transition: 'transform 0.2s cubic-bezier(0.22,1,0.36,1)',
                      }}
                    >
                      Clear
                    </button>
                  )}
                  <button
                    onClick={handleMageNameSave}
                    disabled={mageNameLoading}
                    style={{
                      padding: '10px 24px',
                      background: mageNameLoading ? 'rgba(174,137,255,0.3)' : 'var(--brand-purple)',
                      border: 'none',
                      borderRadius: '12px',
                      color: 'var(--on-primary)',
                      fontSize: '14px',
                      fontWeight: 600,
                      cursor: mageNameLoading ? 'not-allowed' : 'pointer',
                      boxShadow: mageNameLoading ? 'none' : '0 8px 24px rgba(174,137,255,0.3)',
                      transition: 'transform 0.2s cubic-bezier(0.22,1,0.36,1)',
                    }}
                    onMouseEnter={(e) => {
                      if (!mageNameLoading)
                        (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.02)';
                    }}
                    onMouseLeave={(e) => {
                      if (!mageNameLoading)
                        (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
                    }}
                  >
                    {mageNameLoading ? 'Saving…' : 'Save Name'}
                  </button>
                </div>
              </div>
              {mageNameStatus && (
                <p
                  style={{
                    fontSize: '14px',
                    color: mageNameStatus.type === 'success' ? 'var(--success)' : 'var(--error)',
                    margin: 0,
                  }}
                >
                  {mageNameStatus.msg}
                </p>
              )}
            </div>
          </section>

          {/* Welcome tour */}
          <section
            style={{
              background: 'var(--surface-container)',
              borderRadius: isPhone ? '20px' : '32px',
              padding: isPhone ? '20px' : '32px',
              display: visibleSection === 'account' ? 'flex' : 'none',
              flexDirection: isPhone ? 'column' : 'row',
              alignItems: isPhone ? 'flex-start' : 'center',
              justifyContent: 'space-between',
              gap: '20px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                minWidth: 0,
              }}
            >
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '16px',
                  background: 'rgba(174,137,255,0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ color: 'var(--md-h4)', fontSize: '24px' }}
                >
                  tour
                </span>
              </div>
              <div style={{ minWidth: 0 }}>
                <h3
                  style={{
                    fontSize: '22px',
                    fontWeight: 700,
                    color: 'var(--on-surface)',
                    margin: 0,
                  }}
                >
                  Welcome tour
                </h3>
                <p
                  style={{
                    fontSize: '13px',
                    color: 'var(--on-surface-variant)',
                    margin: '4px 0 0 0',
                  }}
                >
                  Re-take the guided tour through your tools, notebooks, and the Learn hub.
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                restartTutorial();
              }}
              style={{
                padding: '12px 22px',
                background: 'var(--brand-purple)',
                border: 'none',
                borderRadius: '12px',
                color: 'var(--on-primary)',
                fontSize: '14px',
                fontWeight: 700,
                fontFamily: 'inherit',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                boxShadow: '0 8px 24px rgba(174,137,255,0.3)',
                transition: 'transform 0.2s cubic-bezier(0.22,1,0.36,1)',
                flexShrink: 0,
                alignSelf: isPhone ? 'stretch' : 'auto',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.02)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
              }}
            >
              Re-take tour
            </button>
          </section>

          {/* Appearance */}
          <section
            style={{
              background: 'var(--surface-container)',
              borderRadius: isPhone ? '20px' : '32px',
              padding: isPhone ? '20px' : '32px',
              display: visibleSection === 'appearance' ? 'flex' : 'none',
              flexDirection: 'column',
              gap: '32px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '16px',
                  background: 'rgba(174,137,255,0.32)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ color: 'var(--md-h4)', fontSize: '24px' }}
                >
                  palette
                </span>
              </div>
              <h3
                style={{ fontSize: '22px', fontWeight: 700, color: 'var(--on-surface)', margin: 0 }}
              >
                Appearance
              </h3>
            </div>

            <div
              style={{
                display: 'flex',
                flexDirection: isPhone ? 'column' : 'row',
                alignItems: isPhone ? 'flex-start' : 'center',
                justifyContent: 'space-between',
                gap: isPhone ? '16px' : '24px',
                padding: '16px',
                background: 'var(--surface-container-low)',
                borderRadius: '16px',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <p
                  style={{
                    fontSize: '15px',
                    fontWeight: 700,
                    color: 'var(--on-surface)',
                    margin: '0 0 2px',
                  }}
                >
                  Color theme
                </p>
                <p style={{ fontSize: '12px', color: 'var(--on-surface-variant)', margin: 0 }}>
                  Choose Light, Dark, or System (follows your device).{' '}
                  {themePreference === 'system' && (
                    <>
                      Currently using <strong>{resolvedTheme}</strong> via system.
                    </>
                  )}
                </p>
              </div>
              <ThemeToggle />
            </div>

            <div
              style={{
                display: 'flex',
                flexDirection: isPhone ? 'column' : 'row',
                alignItems: isPhone ? 'flex-start' : 'center',
                justifyContent: 'space-between',
                gap: isPhone ? '16px' : '24px',
                padding: '16px',
                background: 'var(--surface-container-low)',
                borderRadius: '16px',
              }}
            >
              <div style={{ minWidth: 0, maxWidth: '440px' }}>
                <p
                  style={{
                    fontSize: '15px',
                    fontWeight: 700,
                    color: 'var(--on-surface)',
                    margin: '0 0 2px',
                  }}
                >
                  Quiz reactions
                </p>
                <p style={{ fontSize: '12px', color: 'var(--on-surface-variant)', margin: 0 }}>
                  Pop-up mascot reactions during quizzes. <strong>Minimal</strong> keeps only the
                  big-moment overlays (perfect score, checkpoint pass) plus a gentle nudge when you
                  get three wrong in a row.
                </p>
              </div>
              <div
                role="radiogroup"
                aria-label="Quiz reactions intensity"
                style={{
                  display: 'inline-flex',
                  padding: '4px',
                  background: 'var(--surface-container-high)',
                  borderRadius: '9999px',
                  border: '1px solid var(--outline-variant)',
                  flexShrink: 0,
                }}
              >
                {(['all', 'minimal', 'off'] as const).map((mode) => {
                  const active = quizReactionsMode === mode;
                  return (
                    <button
                      key={mode}
                      role="radio"
                      aria-checked={active}
                      onClick={() => {
                        if (!active) void saveQuizReactionsMode(mode);
                      }}
                      style={{
                        padding: '6px 14px',
                        borderRadius: '9999px',
                        border: 'none',
                        background: active ? 'var(--brand-purple)' : 'transparent',
                        color: active ? 'var(--on-primary)' : 'var(--on-surface-variant)',
                        fontSize: '13px',
                        fontWeight: 600,
                        fontFamily: 'var(--font-display)',
                        cursor: active ? 'default' : 'pointer',
                        textTransform: 'capitalize',
                        transition:
                          'background 0.2s cubic-bezier(0.22,1,0.36,1), color 0.2s cubic-bezier(0.22,1,0.36,1)',
                      }}
                    >
                      {mode}
                    </button>
                  );
                })}
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                flexDirection: isPhone ? 'column' : 'row',
                alignItems: isPhone ? 'flex-start' : 'center',
                justifyContent: 'space-between',
                gap: isPhone ? '16px' : '24px',
                padding: '16px',
                background: 'var(--surface-container-low)',
                borderRadius: '16px',
                opacity: quizReactionsMode === 'off' ? 0.5 : 1,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <p
                  style={{
                    fontSize: '15px',
                    fontWeight: 700,
                    color: 'var(--on-surface)',
                    margin: '0 0 2px',
                  }}
                >
                  Reaction sounds
                </p>
                <p style={{ fontSize: '12px', color: 'var(--on-surface-variant)', margin: 0 }}>
                  Play a short sound on streaks and celebrations. Off by default.
                </p>
              </div>
              <Toggle
                ariaLabel="Reaction sounds"
                checked={quizReactionsAudio && quizReactionsMode !== 'off'}
                onChange={(v) => {
                  if (quizReactionsMode === 'off') return;
                  void saveQuizReactionsAudio(v);
                }}
              />
            </div>
          </section>

          {/* Notifications */}
          <section
            style={{
              background: 'var(--surface-container)',
              borderRadius: isPhone ? '20px' : '32px',
              padding: isPhone ? '20px' : '32px',
              display:
                visibleSection === 'notifications' || visibleSection === 'account'
                  ? 'flex'
                  : 'none',
              flexDirection: 'column',
              gap: '32px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '16px',
                  background: 'rgba(185,195,255,0.32)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ color: 'var(--on-surface-variant)', fontSize: '24px' }}
                >
                  campaign
                </span>
              </div>
              <h3
                style={{ fontSize: '22px', fontWeight: 700, color: 'var(--on-surface)', margin: 0 }}
              >
                Notifications
              </h3>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {[
                {
                  key: 'studyReminders' as const,
                  label: 'Study Reminders',
                  desc: 'Get nudged when you fall behind your daily streak.',
                },
                {
                  key: 'productUpdates' as const,
                  label: 'Product Updates',
                  desc: 'Stay informed about new AI features and beta releases.',
                },
                {
                  key: 'weeklyReport' as const,
                  label: 'Weekly Mage Report',
                  desc: 'A detailed breakdown of your learning progress via email.',
                },
              ].map(({ key, label, desc }) => (
                <div
                  key={key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '24px',
                    padding: '16px',
                    background: 'var(--surface-container-low)',
                    borderRadius: '16px',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLDivElement).style.background =
                      'var(--card-hover-bg-med)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLDivElement).style.background =
                      'var(--surface-container-low)';
                  }}
                >
                  <div>
                    <p
                      style={{
                        fontSize: '15px',
                        fontWeight: 700,
                        color: 'var(--on-surface)',
                        margin: '0 0 2px',
                      }}
                    >
                      {label}
                    </p>
                    <p style={{ fontSize: '12px', color: 'var(--on-surface-variant)', margin: 0 }}>
                      {desc}
                    </p>
                  </div>
                  <Toggle
                    ariaLabel={label}
                    checked={notifications[key]}
                    onChange={(v) =>
                      setNotifications((n) => {
                        const next = { ...n, [key]: v };
                        try {
                          localStorage.setItem('notemage:notification-prefs', JSON.stringify(next));
                        } catch {
                          /* ignore blocked storage */
                        }
                        return next;
                      })
                    }
                  />
                </div>
              ))}
            </div>
            <p
              style={{
                fontSize: '12px',
                color: 'var(--on-surface-variant)',
                margin: 0,
                lineHeight: 1.6,
              }}
            >
              Saved on this device. Email delivery is rolling out soon.
            </p>
          </section>

          {/* Study Goals */}
          <section
            style={{
              background: 'var(--surface-container)',
              borderRadius: isPhone ? '20px' : '32px',
              padding: isPhone ? '20px' : '32px',
              display: visibleSection === 'goals' ? 'flex' : 'none',
              flexDirection: 'column',
              gap: '32px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '16px',
                  background: 'rgba(255,222,89,0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ color: '#ffde59', fontSize: '24px' }}
                >
                  track_changes
                </span>
              </div>
              <div>
                <h3
                  style={{
                    fontSize: '22px',
                    fontWeight: 700,
                    color: 'var(--on-surface)',
                    margin: '0 0 4px',
                  }}
                >
                  Study Goals
                </h3>
                <p style={{ fontSize: '13px', color: 'var(--on-surface-variant)', margin: 0 }}>
                  Set the targets that drive your daily learning habit.
                </p>
              </div>
            </div>

            <form
              onSubmit={handleGoalSave}
              style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}
            >
              <p
                style={{
                  fontSize: '13px',
                  color: 'var(--on-surface-variant)',
                  margin: 0,
                  lineHeight: 1.6,
                }}
              >
                Pick the targets that matter to you. Tap a card to enable or clear a goal.
              </p>

              {/* Goal Cards Grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: isPhone ? '1fr' : '1fr 1fr',
                  gap: '12px',
                }}
              >
                {GOAL_CONFIGS.map((config) => {
                  const target = studyGoals[config.key];
                  const isSelected = target !== null;
                  const mageNameTrimmed = mageNameInput.trim();

                  return (
                    <div
                      key={config.key}
                      role="button"
                      tabIndex={0}
                      aria-pressed={isSelected}
                      aria-label={`${config.label(mageNameTrimmed)} goal`}
                      onClick={() => toggleStudyGoal(config)}
                      onKeyDown={(e) => {
                        // Only the card itself activates on keyboard — let the
                        // nested number input / preset buttons handle their own keys.
                        if (e.target !== e.currentTarget) return;
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          toggleStudyGoal(config);
                        }
                      }}
                      style={{
                        background: 'var(--surface-container-high)',
                        borderRadius: '20px',
                        padding: '20px',
                        border: isSelected
                          ? '2px solid var(--brand-purple)'
                          : '1px solid var(--outline-variant)',
                        boxShadow: isSelected ? '0 0 0 4px rgba(174,137,255,0.1)' : 'none',
                        cursor: 'pointer',
                        transition:
                          'border-color 0.2s cubic-bezier(0.22,1,0.36,1), box-shadow 0.2s cubic-bezier(0.22,1,0.36,1)',
                        userSelect: 'none' as const,
                      }}
                    >
                      <span
                        className="material-symbols-outlined"
                        style={{
                          fontSize: '24px',
                          color: isSelected ? 'var(--md-h4)' : 'var(--on-surface-variant)',
                          display: 'block',
                          marginBottom: '8px',
                          transition: 'color 0.2s cubic-bezier(0.22,1,0.36,1)',
                          fontVariationSettings: isSelected ? "'FILL' 1" : "'FILL' 0",
                        }}
                      >
                        {config.icon}
                      </span>

                      <p
                        style={{
                          margin: '0 0 4px',
                          fontSize: '13px',
                          fontWeight: 600,
                          color: isSelected ? 'var(--on-surface)' : 'var(--on-surface-variant)',
                          lineHeight: '1.4',
                          transition: 'color 0.2s cubic-bezier(0.22,1,0.36,1)',
                        }}
                      >
                        {config.label(mageNameTrimmed)}
                      </p>

                      {isSelected && target !== null ? (
                        <p
                          style={{
                            margin: '0 0 12px',
                            fontSize: '13px',
                            fontWeight: 700,
                            color: 'var(--md-h4)',
                          }}
                        >
                          {target} {config.unit} / {config.cadence}
                        </p>
                      ) : (
                        <p
                          style={{
                            margin: '0 0 0',
                            fontSize: '11px',
                            color: 'var(--on-surface-variant)',
                          }}
                        >
                          Tap to set goal
                        </p>
                      )}

                      {isSelected && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: '6px',
                            marginTop: '4px',
                          }}
                        >
                          {config.presets.map((preset) => {
                            const isActive = target === preset && !goalCustomInputs[config.key];
                            return (
                              <button
                                key={preset}
                                type="button"
                                onClick={() => {
                                  setGoalCustomInputs((prev) => ({ ...prev, [config.key]: '' }));
                                  setStudyGoalTarget(config.key, preset);
                                }}
                                style={{
                                  background: isActive
                                    ? 'var(--brand-purple)'
                                    : 'var(--surface-container-highest)',
                                  color: isActive
                                    ? 'var(--on-primary)'
                                    : 'var(--on-surface-variant)',
                                  border: `1px solid ${isActive ? 'var(--brand-purple)' : 'var(--outline-variant)'}`,
                                  borderRadius: '20px',
                                  padding: '4px 10px',
                                  fontSize: '12px',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                  fontFamily: 'inherit',
                                  transition: 'background 0.15s, color 0.15s, border-color 0.15s',
                                }}
                              >
                                {preset}
                              </button>
                            );
                          })}
                          <input
                            type="number"
                            min={config.min}
                            max={config.max}
                            placeholder="?"
                            value={goalCustomInputs[config.key] || ''}
                            onChange={(e) => handleGoalCustomInput(config, e.target.value)}
                            style={{
                              width: '52px',
                              background: 'var(--surface-container-highest)',
                              border: goalCustomInputs[config.key]
                                ? '1px solid var(--brand-purple)'
                                : '1px solid var(--outline-variant)',
                              borderRadius: '8px',
                              padding: '4px 8px',
                              color: 'var(--on-surface)',
                              fontSize: '12px',
                              fontFamily: 'inherit',
                              outline: 'none',
                            }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {goalStatus && (
                <div
                  style={{
                    padding: '12px 16px',
                    borderRadius: '12px',
                    background:
                      goalStatus.type === 'error'
                        ? 'rgba(253,111,133,0.12)'
                        : 'rgba(174,137,255,0.12)',
                    color: goalStatus.type === 'error' ? 'var(--error)' : 'var(--md-h4)',
                    fontSize: '14px',
                  }}
                >
                  {goalStatus.msg}
                </div>
              )}

              <button
                type="submit"
                disabled={goalLoading}
                style={{
                  alignSelf: 'flex-start',
                  padding: '14px 32px',
                  background: goalLoading ? 'var(--outline-variant)' : 'var(--brand-purple)',
                  color: goalLoading ? 'var(--on-surface-variant)' : 'var(--on-primary)',
                  border: 'none',
                  borderRadius: '16px',
                  fontWeight: 700,
                  fontSize: '15px',
                  cursor: goalLoading ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                  boxShadow: goalLoading ? 'none' : '0 8px 24px rgba(174,137,255,0.3)',
                  transition: 'transform 0.2s cubic-bezier(0.22,1,0.36,1)',
                }}
                onMouseEnter={(e) => {
                  if (!goalLoading)
                    (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.02)';
                }}
                onMouseLeave={(e) => {
                  if (!goalLoading)
                    (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
                }}
              >
                {goalLoading ? 'Saving…' : 'Save Goals'}
              </button>
            </form>
          </section>

          {/* Subscription Management */}
          <section
            style={{
              background: 'var(--surface-container)',
              borderRadius: isPhone ? '20px' : '32px',
              padding: isPhone ? '20px' : '32px',
              display: visibleSection === 'subscription' ? 'flex' : 'none',
              flexDirection: 'column',
              gap: '32px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '16px',
                  background: 'rgba(192,132,252,0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ color: '#c084fc', fontSize: '24px' }}
                >
                  credit_card
                </span>
              </div>
              <div>
                <h3
                  style={{
                    fontSize: '22px',
                    fontWeight: 700,
                    color: 'var(--on-surface)',
                    margin: '0 0 4px',
                  }}
                >
                  Subscription
                </h3>
                <p style={{ fontSize: '13px', color: 'var(--on-surface-variant)', margin: 0 }}>
                  Manage your plan and billing.
                </p>
              </div>
            </div>

            {/* Current plan + actions (upgrade / manage / cancel) */}
            <SubscriptionPanel />
          </section>

          {/* Delete Account (desktop; the phone root list has its own danger row) */}
          {!isPhone && (
          <button
            onClick={() => setDeleteConfirmOpen(true)}
            style={{
              alignSelf: 'flex-start',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 20px',
              background: 'transparent',
              color: 'var(--error)',
              border: '1px solid rgba(253,111,133,0.2)',
              borderRadius: '12px',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition:
                'border-color 0.2s cubic-bezier(0.22,1,0.36,1), color 0.2s cubic-bezier(0.22,1,0.36,1)',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(253,111,133,0.5)';
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--error)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(253,111,133,0.2)';
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--error)';
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
              delete_forever
            </span>
            Delete Account
          </button>
          )}
        </div>
        )}
      </div>

      {/* Avatar Editor */}
      <AvatarEditor
        open={avatarEditorOpen}
        onClose={() => setAvatarEditorOpen(false)}
        onSaved={async () => {
          setAvatarEditorOpen(false);
          await updateSession();
        }}
      />
      {/* Delete Account Confirmation Modal */}
      {deleteConfirmOpen && (
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
            if (e.target === e.currentTarget && !deleting) {
              setDeleteConfirmOpen(false);
              setDeleteConfirmText('');
            }
          }}
        >
          <div
            style={{
              background: 'var(--surface-container)',
              borderRadius: '24px',
              padding: '32px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '20px',
              maxWidth: '400px',
              width: '90%',
              border: '1px solid rgba(253,111,133,0.3)',
            }}
          >
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '16px',
                background: 'rgba(253,111,133,0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{ color: 'var(--error)', fontSize: '28px' }}
              >
                warning
              </span>
            </div>
            <h3
              style={{
                fontSize: '20px',
                fontWeight: 700,
                color: 'var(--on-surface)',
                margin: 0,
                textAlign: 'center',
              }}
            >
              Delete your account?
            </h3>
            <p
              style={{
                fontSize: '14px',
                color: 'var(--on-surface-variant)',
                lineHeight: 1.7,
                margin: 0,
                textAlign: 'center',
              }}
            >
              All your notebooks, flashcards, progress, and data will be permanently deleted. This
              cannot be undone.
            </p>
            <div style={{ width: '100%' }}>
              <label
                style={{
                  fontSize: '13px',
                  color: 'var(--on-surface-variant)',
                  marginBottom: '8px',
                  display: 'block',
                }}
              >
                Type <strong style={{ color: 'var(--error)' }}>DELETE</strong> to confirm
              </label>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="DELETE"
                autoComplete="off"
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  background: 'var(--surface-container-high)',
                  border: '1px solid var(--outline-variant)',
                  borderRadius: '12px',
                  color: 'var(--on-surface)',
                  fontSize: '14px',
                  fontFamily: 'inherit',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: '12px', width: '100%', marginTop: '4px' }}>
              <button
                disabled={deleting}
                onClick={() => {
                  setDeleteConfirmOpen(false);
                  setDeleteConfirmText('');
                }}
                style={{
                  flex: 1,
                  padding: '12px',
                  background: 'var(--surface-container-high)',
                  color: 'var(--on-surface)',
                  border: '1px solid var(--outline-variant)',
                  borderRadius: '14px',
                  fontWeight: 600,
                  fontSize: '14px',
                  cursor: deleting ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                  opacity: deleting ? 0.5 : 1,
                  transition: 'background 0.2s cubic-bezier(0.22,1,0.36,1)',
                }}
              >
                Cancel
              </button>
              <button
                disabled={deleting || deleteConfirmText !== 'DELETE'}
                onClick={async () => {
                  setDeleting(true);
                  try {
                    const res = await fetch('/api/user/delete-account', { method: 'DELETE' });
                    if (res.ok) {
                      await signOut({ callbackUrl: '/' });
                    } else {
                      alert('Failed to delete account. Please try again.');
                      setDeleting(false);
                    }
                  } catch {
                    alert('Failed to delete account. Please try again.');
                    setDeleting(false);
                  }
                }}
                style={{
                  flex: 1,
                  padding: '12px',
                  background: deleteConfirmText === 'DELETE' ? '#c8475d' : 'rgba(200,71,93,0.3)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '14px',
                  fontWeight: 700,
                  fontSize: '14px',
                  cursor: deleting || deleteConfirmText !== 'DELETE' ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                  opacity: deleting ? 0.7 : deleteConfirmText !== 'DELETE' ? 0.5 : 1,
                  transition:
                    'background 0.2s cubic-bezier(0.22,1,0.36,1), opacity 0.2s cubic-bezier(0.22,1,0.36,1)',
                }}
              >
                {deleting ? 'Deleting…' : 'Yes, delete my account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
