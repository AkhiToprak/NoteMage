'use client';

import { useEffect, useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import SettingsShell from '@/components/settings/SettingsShell';
import {
  SettingsCard,
  CardHead,
  FieldLabel,
  settingsInput,
  StatusLine,
  type StatusMsg,
} from '@/components/settings/SettingsKit';
import GradingSystemWizard from '@/components/onboarding/GradingSystemWizard';
import { getGradingSystem } from '@/lib/grading-systems';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import {
  GOAL_CONFIGS,
  EMPTY_GOAL_VALUES,
  type GoalKey,
  type GoalValues,
} from '@/components/onboarding/StudyGoalsStep';
import ui from '@/components/app/ui.module.css';

/* Account settings (cream redesign). Reached from /profile → "Account".
   Folds the old /settings "account / privacy / goals / grading" sections into
   one screen, preserving every real data path:
     · email (read-only) + change password   → /api/user/password
     · dashboard greeting + mage name         → /api/user/profile
     · study goals                            → /api/user/study-goals
     · grading system (when migration landed) → /api/user/grading-system
     · delete account                         → /api/user/delete-account */

export default function AccountSettingsPage() {
  const { data: session, update: updateSession } = useSession();
  const { isPhone } = useBreakpoint();

  // ── Password ──────────────────────────────────────────────────────────────
  const [passwords, setPasswords] = useState({ current: '', newPass: '', confirm: '' });
  const [pwStatus, setPwStatus] = useState<StatusMsg>(null);
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
        setPasswords({ current: '', newPass: '', confirm: '' });
        await signOut({ callbackUrl: '/auth/login' });
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

  // ── Greeting + mage name (loaded from the profile record) ───────────────────
  const [customGreeting, setCustomGreeting] = useState('');
  const [greetingLoading, setGreetingLoading] = useState(false);
  const [greetingStatus, setGreetingStatus] = useState<StatusMsg>(null);

  const [mageNameInput, setMageNameInput] = useState('');
  const [mageNameLoading, setMageNameLoading] = useState(false);
  const [mageNameStatus, setMageNameStatus] = useState<StatusMsg>(null);

  useEffect(() => {
    fetch('/api/user/profile')
      .then((r) => r.json())
      .then((res) => {
        if (res?.data?.customGreeting) setCustomGreeting(res.data.customGreeting);
        if (res?.data?.scholarName) setMageNameInput(res.data.scholarName);
      })
      .catch(() => {});
  }, []);

  const saveGreeting = async (value: string | null) => {
    setGreetingLoading(true);
    setGreetingStatus(null);
    try {
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
        const json = await res.json().catch(() => null);
        setGreetingStatus({ type: 'error', msg: json?.error || 'Failed to save.' });
      }
    } catch {
      setGreetingStatus({ type: 'error', msg: 'Network error. Try again.' });
    }
    setGreetingLoading(false);
  };

  const saveMageName = async (value: string | null) => {
    setMageNameLoading(true);
    setMageNameStatus(null);
    try {
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
        const json = await res.json().catch(() => null);
        setMageNameStatus({ type: 'error', msg: json?.error || 'Failed to save.' });
      }
    } catch {
      setMageNameStatus({ type: 'error', msg: 'Network error. Try again.' });
    }
    setMageNameLoading(false);
  };

  // ── Study goals ─────────────────────────────────────────────────────────────
  const [studyGoals, setStudyGoals] = useState<GoalValues>({ ...EMPTY_GOAL_VALUES });
  const [goalCustomInputs, setGoalCustomInputs] = useState<Record<string, string>>({});
  const [goalStatus, setGoalStatus] = useState<StatusMsg>(null);
  const [goalLoading, setGoalLoading] = useState(false);

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
    if (!isNaN(num) && num >= config.min && num <= config.max) setStudyGoalTarget(config.key, num);
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
      setGoalStatus(
        res.ok
          ? { type: 'success', msg: 'Study goals updated!' }
          : { type: 'error', msg: 'Failed to save. Try again.' }
      );
    } catch {
      setGoalStatus({ type: 'error', msg: 'Network error. Try again.' });
    }
    setGoalLoading(false);
  };

  // ── Grading system (hidden until the migration lands → available=false) ─────
  const [gradingId, setGradingId] = useState<string | null>(null);
  const [gradingAvailable, setGradingAvailable] = useState(false);
  const [gradingPickerOpen, setGradingPickerOpen] = useState(false);

  useEffect(() => {
    fetch('/api/user/grading-system')
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        const d = res?.data ?? res;
        if (d?.available) {
          setGradingAvailable(true);
          setGradingId(d.gradingSystem ?? null);
        }
      })
      .catch(() => {});
  }, []);

  // ── Delete account ──────────────────────────────────────────────────────────
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteText, setDeleteText] = useState('');
  const [deleting, setDeleting] = useState(false);

  const mageNameTrimmed = mageNameInput.trim();
  const saveBtn = `${ui.btn} ${ui.primary} ${ui.small}`;
  const ghostBtn = `${ui.btn} ${ui.ghost} ${ui.small}`;

  return (
    <SettingsShell label="Account" subtitle="Your sign-in, personalization, and account controls.">
      {/* ── Account security ── */}
      <SettingsCard>
        <CardHead icon="fingerprint" title="Account security" desc="Your email and password." />

        <div>
          <FieldLabel htmlFor="acct-email">Email address</FieldLabel>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              id="acct-email"
              type="email"
              value={session?.user?.email ?? ''}
              readOnly
              className="set-input"
              style={{ ...settingsInput, flex: 1, minWidth: 220, color: 'var(--body)' }}
            />
            <button
              type="button"
              disabled
              title="Email changes aren't available yet"
              className={`${ui.btn} ${ui.ghost} ${ui.small}`}
              style={{ cursor: 'not-allowed', opacity: 0.6 }}
            >
              Change email
            </button>
          </div>
          <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--muted)' }}>
            Email changes are not available yet.
          </p>
        </div>

        <form
          onSubmit={handlePasswordUpdate}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            borderTop: '1px solid var(--border)',
            paddingTop: 20,
          }}
        >
          <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 700, color: 'var(--ink)' }}>
            Change password
          </h3>
          <input
            type="password"
            aria-label="Current password"
            placeholder="Current password"
            value={passwords.current}
            onChange={(e) => setPasswords((p) => ({ ...p, current: e.target.value }))}
            className="set-input"
            style={settingsInput}
          />
          <div
            style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : '1fr 1fr', gap: 12 }}
          >
            <input
              type="password"
              aria-label="New password"
              placeholder="New password"
              value={passwords.newPass}
              onChange={(e) => setPasswords((p) => ({ ...p, newPass: e.target.value }))}
              className="set-input"
              style={settingsInput}
            />
            <input
              type="password"
              aria-label="Confirm new password"
              placeholder="Confirm new password"
              value={passwords.confirm}
              onChange={(e) => setPasswords((p) => ({ ...p, confirm: e.target.value }))}
              className="set-input"
              style={settingsInput}
            />
          </div>
          <StatusLine status={pwStatus} />
          <button
            type="submit"
            disabled={pwLoading}
            className={saveBtn}
            style={{ alignSelf: 'flex-start', opacity: pwLoading ? 0.7 : 1 }}
          >
            {pwLoading ? 'Updating…' : 'Update password'}
          </button>
        </form>
      </SettingsCard>

      {/* ── Dashboard greeting ── */}
      <SettingsCard>
        <CardHead
          icon="waving_hand"
          tint="gold"
          title="Dashboard greeting"
          desc="Set a custom greeting. Use {name} to include your name."
        />
        <input
          type="text"
          placeholder="e.g. The mighty {name} has arrived!"
          value={customGreeting}
          onChange={(e) => {
            setCustomGreeting(e.target.value);
            setGreetingStatus(null);
          }}
          maxLength={120}
          className="set-input"
          style={settingsInput}
        />
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
            {customGreeting.length}/120 · Leave empty for random greetings
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            {customGreeting && (
              <button
                type="button"
                onClick={() => saveGreeting(null)}
                disabled={greetingLoading}
                className={ghostBtn}
              >
                Clear
              </button>
            )}
            <button
              type="button"
              onClick={() => saveGreeting(customGreeting.trim() || null)}
              disabled={greetingLoading}
              className={saveBtn}
              style={{ opacity: greetingLoading ? 0.7 : 1 }}
            >
              {greetingLoading ? 'Saving…' : 'Save greeting'}
            </button>
          </div>
        </div>
        <StatusLine status={greetingStatus} />
      </SettingsCard>

      {/* ── Mage name ── */}
      <SettingsCard>
        <CardHead
          icon="auto_awesome"
          title="Mage name"
          desc="Give your AI study assistant a custom name."
        />
        <input
          type="text"
          placeholder="e.g. Archimedes, Sage, Athena…"
          value={mageNameInput}
          onChange={(e) => {
            setMageNameInput(e.target.value);
            setMageNameStatus(null);
          }}
          maxLength={30}
          className="set-input"
          style={settingsInput}
        />
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
            {mageNameInput.length}/30 · Leave empty for default “Mage”
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            {mageNameInput && (
              <button
                type="button"
                onClick={() => saveMageName(null)}
                disabled={mageNameLoading}
                className={ghostBtn}
              >
                Clear
              </button>
            )}
            <button
              type="button"
              onClick={() => saveMageName(mageNameInput.trim() || null)}
              disabled={mageNameLoading}
              className={saveBtn}
              style={{ opacity: mageNameLoading ? 0.7 : 1 }}
            >
              {mageNameLoading ? 'Saving…' : 'Save name'}
            </button>
          </div>
        </div>
        <StatusLine status={mageNameStatus} />
      </SettingsCard>

      {/* ── Study goals ── */}
      <SettingsCard>
        <CardHead
          icon="track_changes"
          tint="amber"
          title="Study goals"
          desc="Set the targets that drive your daily habit."
        />
        <form
          onSubmit={handleGoalSave}
          style={{ display: 'flex', flexDirection: 'column', gap: 18 }}
        >
          <div
            style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : '1fr 1fr', gap: 12 }}
          >
            {GOAL_CONFIGS.map((config) => {
              const target = studyGoals[config.key];
              const isSelected = target !== null;
              return (
                <div
                  key={config.key}
                  role="button"
                  tabIndex={0}
                  aria-pressed={isSelected}
                  aria-label={`${config.label(mageNameTrimmed)} goal`}
                  onClick={() => toggleStudyGoal(config)}
                  onKeyDown={(e) => {
                    if (e.target !== e.currentTarget) return;
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      toggleStudyGoal(config);
                    }
                  }}
                  style={{
                    background: isSelected ? 'var(--lilac-soft)' : 'var(--surface)',
                    borderRadius: 'var(--rm)',
                    padding: 18,
                    border: isSelected ? '2px solid var(--primary)' : '1px solid var(--border)',
                    cursor: 'pointer',
                    userSelect: 'none',
                    transition:
                      'border-color 0.18s var(--ease), background-color 0.18s var(--ease)',
                  }}
                >
                  <span
                    className="material-symbols-outlined"
                    style={{
                      fontSize: 24,
                      color: isSelected ? 'var(--accent)' : 'var(--muted)',
                      display: 'block',
                      marginBottom: 8,
                      fontVariationSettings: isSelected ? "'FILL' 1" : "'FILL' 0",
                    }}
                  >
                    {config.icon}
                  </span>
                  <p
                    style={{
                      margin: '0 0 4px',
                      fontSize: 13,
                      fontWeight: 600,
                      color: isSelected ? 'var(--ink)' : 'var(--body)',
                      lineHeight: 1.4,
                    }}
                  >
                    {config.label(mageNameTrimmed)}
                  </p>
                  {isSelected && target !== null ? (
                    <p
                      style={{
                        margin: '0 0 12px',
                        fontSize: 13,
                        fontWeight: 700,
                        color: 'var(--accent)',
                      }}
                    >
                      {target} {config.unit} / {config.cadence}
                    </p>
                  ) : (
                    <p style={{ margin: 0, fontSize: 11, color: 'var(--muted)' }}>
                      Tap to set goal
                    </p>
                  )}
                  {isSelected && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}
                    >
                      {config.presets.map((preset) => {
                        const active = target === preset && !goalCustomInputs[config.key];
                        return (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => {
                              setGoalCustomInputs((prev) => ({ ...prev, [config.key]: '' }));
                              setStudyGoalTarget(config.key, preset);
                            }}
                            style={{
                              background: active ? 'var(--primary)' : 'var(--surface)',
                              color: active ? '#fff' : 'var(--body)',
                              border: `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
                              borderRadius: 999,
                              padding: '4px 11px',
                              fontSize: 12,
                              fontWeight: 600,
                              cursor: 'pointer',
                              fontFamily: 'inherit',
                              transition:
                                'background-color 0.15s var(--ease), color 0.15s var(--ease), border-color 0.15s var(--ease)',
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
                        aria-label={`Custom ${config.label(mageNameTrimmed)} target`}
                        value={goalCustomInputs[config.key] || ''}
                        onChange={(e) => handleGoalCustomInput(config, e.target.value)}
                        style={{
                          width: 52,
                          background: 'var(--surface)',
                          border: goalCustomInputs[config.key]
                            ? '1px solid var(--primary)'
                            : '1px solid var(--border)',
                          borderRadius: 8,
                          padding: '4px 8px',
                          color: 'var(--ink)',
                          fontSize: 12,
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
          <StatusLine status={goalStatus} />
          <button
            type="submit"
            disabled={goalLoading}
            className={saveBtn}
            style={{ alignSelf: 'flex-start', opacity: goalLoading ? 0.7 : 1 }}
          >
            {goalLoading ? 'Saving…' : 'Save goals'}
          </button>
        </form>
      </SettingsCard>

      {/* ── Grading system (conditional) ── */}
      {gradingAvailable && (
        <SettingsCard>
          <CardHead
            icon="grade"
            title="Grading system"
            desc="How your grades are shown across NoteMage."
          />
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
              <span style={{ fontSize: 28, lineHeight: 1 }} aria-hidden>
                {gradingId ? (getGradingSystem(gradingId)?.flag ?? '🎓') : '🎓'}
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--ink)' }}>
                  {gradingId ? (getGradingSystem(gradingId)?.label ?? gradingId) : 'Not set yet'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--body)', marginTop: 2 }}>
                  {gradingId ? 'Your current grading system' : 'Pick the system you use'}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setGradingPickerOpen(true)}
              className={`${ui.btn} ${ui.secondary} ${ui.small}`}
            >
              {gradingId ? 'Change' : 'Choose'}
            </button>
          </div>
        </SettingsCard>
      )}

      {/* ── Danger zone ── */}
      <SettingsCard style={{ borderColor: 'var(--danger-line)' }}>
        <CardHead
          icon="warning"
          tint="rose"
          title="Delete account"
          desc="Permanently remove your account and all your data."
        />
        <button
          type="button"
          onClick={() => setDeleteOpen(true)}
          className={`${ui.btn} ${ui.small}`}
          style={{
            alignSelf: 'flex-start',
            background: 'var(--danger-soft)',
            color: 'var(--danger-ink)',
            border: '1px solid var(--danger-line)',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }} aria-hidden>
            delete_forever
          </span>
          Delete account
        </button>
      </SettingsCard>

      {/* ── Modals ── */}
      {gradingPickerOpen && (
        <GradingSystemWizard
          current={gradingId}
          skipLabel="Cancel"
          onSave={async (id) => {
            const res = await fetch('/api/user/grading-system', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ gradingSystem: id }),
            });
            if (res.ok) setGradingId(id);
            setGradingPickerOpen(false);
          }}
          onSkip={() => setGradingPickerOpen(false)}
        />
      )}

      {deleteOpen && (
        <DeleteAccountModal
          text={deleteText}
          setText={setDeleteText}
          deleting={deleting}
          onClose={() => {
            if (deleting) return;
            setDeleteOpen(false);
            setDeleteText('');
          }}
          onConfirm={async () => {
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
        />
      )}
    </SettingsShell>
  );
}

// ── Delete-account confirmation (cream) ──────────────────────────────────────

function DeleteAccountModal({
  text,
  setText,
  deleting,
  onClose,
  onConfirm,
}: {
  text: string;
  setText: (v: string) => void;
  deleting: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="del-acct-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(24,32,47,0.45)',
        backdropFilter: 'blur(6px)',
        padding: 16,
      }}
    >
      <div
        style={{
          background: 'var(--surface)',
          borderRadius: 'var(--rc)',
          padding: 28,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 16,
          maxWidth: 400,
          width: '100%',
          border: '1px solid var(--danger-line)',
          boxShadow: '0 24px 64px rgba(24,32,47,0.28)',
        }}
      >
        <span
          aria-hidden
          style={{
            width: 52,
            height: 52,
            borderRadius: 15,
            background: 'var(--danger-soft)',
            color: 'var(--danger-ink)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 28 }}>
            warning
          </span>
        </span>
        <h3
          id="del-acct-title"
          style={{
            margin: 0,
            fontSize: 19,
            fontWeight: 700,
            color: 'var(--ink)',
            textAlign: 'center',
          }}
        >
          Delete your account?
        </h3>
        <p
          style={{
            margin: 0,
            fontSize: 13.5,
            color: 'var(--body)',
            lineHeight: 1.6,
            textAlign: 'center',
          }}
        >
          All your paths, study packs, progress, and data will be permanently deleted. This cannot
          be undone.
        </p>
        <div style={{ width: '100%' }}>
          <label
            htmlFor="del-acct-confirm"
            style={{ display: 'block', fontSize: 12.5, color: 'var(--body)', marginBottom: 8 }}
          >
            Type <strong style={{ color: 'var(--danger-ink)' }}>DELETE</strong> to confirm
          </label>
          <input
            id="del-acct-confirm"
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="DELETE"
            autoComplete="off"
            className="set-input"
            style={settingsInput}
          />
        </div>
        <div style={{ display: 'flex', gap: 12, width: '100%' }}>
          <button
            type="button"
            disabled={deleting}
            onClick={onClose}
            className={`${ui.btn} ${ui.ghost}`}
            style={{ flex: 1, opacity: deleting ? 0.5 : 1 }}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={deleting || text !== 'DELETE'}
            onClick={onConfirm}
            className={`${ui.btn} del-confirm-btn`}
            style={{
              flex: 1,
              background: text === 'DELETE' ? 'var(--danger)' : 'var(--del-disabled, #e7b4ad)',
              color: '#fff',
              cursor: deleting || text !== 'DELETE' ? 'not-allowed' : 'pointer',
              opacity: deleting ? 0.7 : 1,
            }}
          >
            {deleting ? 'Deleting…' : 'Delete account'}
          </button>
        </div>
      </div>
    </div>
  );
}
