'use client';

/* Hallmark · component: settings-screen · genre: playful · theme: cream (AppShell .shell)
 * states: default · hover · focus · active · disabled · loading · error · success
 * contrast: pass (46–50)
 *
 * Notification settings (Exam Mode Phase 6). Reached from /profile → "Notifications".
 * DB-backed via /api/user/notification-preferences (replaces the old
 * localStorage-only version). Matches the Figma "Reminders" frame's
 * "What to remind me about" card + phone preview, but only ships toggles the
 * reminder cron genuinely fires — the fabricated metrics, timing/quiet-hours
 * controls, and never-sent channels from the mock are dropped (honest-copy). */

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import SettingsShell from '@/components/settings/SettingsShell';
import { SettingsCard, CardHead, SettingsToggle, StatusLine, type StatusMsg } from '@/components/settings/SettingsKit';

type Prefs = {
  examReminders: boolean;
  readinessAlerts: boolean;
  emailReminders: boolean;
};

const DEFAULTS: Prefs = { examReminders: true, readinessAlerts: true, emailReminders: true };

const REMINDER_ROWS: { key: keyof Prefs; title: string; desc: string }[] = [
  {
    key: 'examReminders',
    title: 'Exam countdown',
    desc: 'A heads-up at 7, 3, and 1 days before each exam — plus a nudge on exam day.',
  },
  {
    key: 'readinessAlerts',
    title: 'Readiness nudges',
    desc: "When an exam is close and you're behind on weak topics, I'll flag what to review.",
  },
];

export default function NotificationsSettingsPage() {
  const { data: session } = useSession();
  const email = session?.user?.email ?? null;
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState<StatusMsg>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/user/notification-preferences')
      .then((r) => (r.ok ? r.json() : null))
      .then((prefRes) => {
        if (cancelled) return;
        const data = prefRes?.data ?? prefRes;
        if (data && typeof data === 'object') {
          setPrefs({
            examReminders: data.examReminders !== false,
            readinessAlerts: data.readinessAlerts !== false,
            emailReminders: data.emailReminders !== false,
          });
        }
      })
      .catch(() => {
        /* keep defaults — the toggles still work, just not yet persisted */
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = async (next: Prefs) => {
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch('/api/user/notification-preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
      if (!res.ok) throw new Error(String(res.status));
      setStatus({ type: 'success', msg: 'Saved' });
    } catch {
      setStatus({ type: 'error', msg: "Couldn't save — check your connection and try again." });
    } finally {
      setSaving(false);
    }
  };

  const set = (key: keyof Prefs, value: boolean) => {
    const prev = prefs;
    const next = { ...prefs, [key]: value };
    setPrefs(next); // optimistic
    void persist(next).then(() => {
      // revert on failure is handled by the error status; re-read keeps it simple
      if (!navigator.onLine) setPrefs(prev);
    });
  };

  return (
    <SettingsShell label="Notifications" title="Reminders" subtitle="Choose what NoteMage can nudge you about.">
      <div className="notif-grid">
        <div className="notif-col">
          <SettingsCard>
            <CardHead
              icon="notifications_active"
              title="What to remind me about"
              desc="Choose which events trigger a nudge."
            />
            <div className="notif-rows">
              {REMINDER_ROWS.map(({ key, title, desc }, i) => (
                <div key={key} className="notif-row" data-first={i === 0}>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 14.5, fontWeight: 600, color: 'var(--ink)' }}>{title}</p>
                    <p style={{ margin: '3px 0 0', fontSize: 12.5, color: 'var(--body)', lineHeight: 1.5 }}>{desc}</p>
                  </div>
                  <SettingsToggle
                    checked={prefs[key]}
                    onChange={(v) => set(key, v)}
                    disabled={!loaded}
                    ariaLabel={title}
                  />
                </div>
              ))}
            </div>
          </SettingsCard>

          <SettingsCard>
            <CardHead icon="mail" title="Email" desc="Send these reminders to your inbox too." tint="amber" />
            <div className="notif-row" data-first="true">
              <div style={{ minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 14.5, fontWeight: 600, color: 'var(--ink)' }}>Email reminders</p>
                <p style={{ margin: '3px 0 0', fontSize: 12.5, color: 'var(--body)', lineHeight: 1.5 }}>
                  {email ? `Also delivered to ${email}.` : 'Also deliver reminders by email.'}
                </p>
              </div>
              <SettingsToggle
                checked={prefs.emailReminders}
                onChange={(v) => set('emailReminders', v)}
                disabled={!loaded}
                ariaLabel="Email reminders"
              />
            </div>
            {!prefs.examReminders && !prefs.readinessAlerts && (
              <p
                style={{
                  margin: 0,
                  fontSize: 12.5,
                  color: 'var(--body)',
                  background: 'var(--lilac-soft)',
                  borderRadius: 'var(--rm)',
                  padding: '10px 14px',
                  lineHeight: 1.5,
                }}
              >
                Reminders are off, so there&apos;s nothing to email. Turn one on above to start getting nudges.
              </p>
            )}
            <StatusLine status={saving ? null : status} />
          </SettingsCard>
        </div>

        <aside className="notif-col">
          <PreviewCard active={prefs.examReminders || prefs.readinessAlerts} />
        </aside>
      </div>

      <style>{`
        .notif-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr);
          gap: 18px;
          align-items: start;
        }
        .notif-col { display: flex; flex-direction: column; gap: 18px; min-width: 0; }
        .notif-rows { display: flex; flex-direction: column; }
        .notif-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 18px;
          padding: 15px 2px;
          border-top: 1px solid var(--border);
        }
        .notif-row[data-first="true"] { border-top: none; padding-top: 2px; }
        @media (min-width: 860px) {
          .notif-grid { grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr); }
        }
      `}</style>
    </SettingsShell>
  );
}

/* Right-column preview — "how a reminder looks". Clearly an EXAMPLE (generic
   exam name, labelled "Preview"), not fabricated user data. */
function PreviewCard({ active }: { active: boolean }) {
  return (
    <SettingsCard style={{ background: 'var(--surface)' }}>
      <CardHead icon="smartphone" title="How a reminder looks" desc="A preview of your nudges." tint="gold" />
      <div
        style={{
          background: 'var(--lilac-soft)',
          borderRadius: 'var(--rc)',
          padding: '16px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          opacity: active ? 1 : 0.55,
          transition: 'opacity 0.2s var(--ease)',
        }}
      >
        <span
          style={{
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--muted)',
          }}
        >
          Preview
        </span>
        <PreviewToast body="Biology Final is in 3 days. Open today's plan to see what to practice." />
        <PreviewToast body="You're behind on Biology Final — 4 weak topics to review before it counts." />
        <PreviewToast body="Tomorrow is exam day. Take a breath — you've put in the work." />
      </div>
      <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
        Examples only. Real reminders use your exam names, dates, and weak topics.
      </p>
    </SettingsCard>
  );
}

function PreviewToast({ body }: { body: string }) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 11,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--rm)',
        padding: '11px 12px',
      }}
    >
      <span
        aria-hidden
        style={{
          width: 34,
          height: 34,
          borderRadius: 10,
          background: 'var(--primary)',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/mascot/holding-wand-v2.png" alt="" width={30} height={30} style={{ objectFit: 'contain' }} />
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)' }}>NoteMage</span>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>now</span>
        </div>
        <p style={{ margin: '2px 0 0', fontSize: 12.5, color: 'var(--body)', lineHeight: 1.45 }}>{body}</p>
      </div>
    </div>
  );
}
