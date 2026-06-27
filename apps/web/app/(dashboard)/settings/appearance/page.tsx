'use client';

import { useEffect, useState } from 'react';
import SettingsShell from '@/components/settings/SettingsShell';
import { SettingsCard, CardHead, Segmented, ToggleRow } from '@/components/settings/SettingsKit';
import { hapticsEnabled, setHapticsEnabled } from '@/lib/haptics';
import { isInsideNativeShell } from '@/lib/native-bridge';

/* Appearance settings (cream redesign). Reached from /profile → "Appearance".
   Theme toggle removed — the app is locked to light until dark mode is designed.
   Remaining sections:
     · quiz reaction intensity + sounds  → /api/user/settings
     · haptic feedback (native shell only, device-local) */

type ReactionsMode = 'all' | 'minimal' | 'off';

/** A control row: title + description on the left, control on the right.
 *  Stacks under 560px so the segmented control never crowds the copy. */
function ControlRow({
  title,
  desc,
  children,
}: {
  title: string;
  desc: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        padding: '14px 16px',
        background: 'var(--lilac-soft)',
        borderRadius: 'var(--rm)',
      }}
    >
      <div style={{ minWidth: 200, flex: 1 }}>
        <p style={{ margin: 0, fontSize: 14.5, fontWeight: 600, color: 'var(--ink)' }}>{title}</p>
        <p style={{ margin: '3px 0 0', fontSize: 12.5, color: 'var(--body)', lineHeight: 1.5 }}>{desc}</p>
      </div>
      {children}
    </div>
  );
}

export default function AppearanceSettingsPage() {
  const [reactionsMode, setReactionsMode] = useState<ReactionsMode>('all');
  const [reactionsAudio, setReactionsAudio] = useState(false);

  const [hapticsPref, setHapticsPref] = useState(true);
  const [hapticsAvailable, setHapticsAvailable] = useState(false);

  // Detect the native shell + read the device-local haptics pref after mount.
  // Both depend on client-only signals (WebView bridge / localStorage), so the
  // server can't know them — setting state here is what avoids an SSR hydration
  // mismatch (a lazy useState initializer would diverge on hydration).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- client-only, see above
    setHapticsAvailable(isInsideNativeShell());
    setHapticsPref(hapticsEnabled());
  }, []);

  useEffect(() => {
    fetch('/api/user/settings')
      .then((r) => r.json())
      .then((res) => {
        const d = res?.data ?? res;
        if (d && typeof d === 'object') {
          if (d.quizReactionsMode === 'all' || d.quizReactionsMode === 'minimal' || d.quizReactionsMode === 'off') {
            setReactionsMode(d.quizReactionsMode);
          }
          if (typeof d.quizReactionsAudio === 'boolean') setReactionsAudio(d.quizReactionsAudio);
        }
      })
      .catch(() => {});
  }, []);

  // Optimistic writes — revert on a failed PATCH.
  const saveReactionsMode = async (mode: ReactionsMode) => {
    const previous = reactionsMode;
    setReactionsMode(mode);
    try {
      const res = await fetch('/api/user/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quizReactionsMode: mode }),
      });
      if (!res.ok) setReactionsMode(previous);
    } catch {
      setReactionsMode(previous);
    }
  };

  const saveReactionsAudio = async (audio: boolean) => {
    const previous = reactionsAudio;
    setReactionsAudio(audio);
    try {
      const res = await fetch('/api/user/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quizReactionsAudio: audio }),
      });
      if (!res.ok) setReactionsAudio(previous);
    } catch {
      setReactionsAudio(previous);
    }
  };

  return (
    <SettingsShell label="Appearance" subtitle="In-app reactions.">
      <SettingsCard>
        <CardHead icon="celebration" tint="amber" title="Reactions" desc="Mascot reactions and sounds during quizzes." />

        <ControlRow
          title="Quiz reactions"
          desc={
            <>
              Pop-up mascot reactions during quizzes. <strong>Minimal</strong> keeps only the big-moment
              overlays plus a gentle nudge after three wrong in a row.
            </>
          }
        >
          <Segmented<ReactionsMode>
            ariaLabel="Quiz reactions intensity"
            value={reactionsMode}
            onChange={(m) => saveReactionsMode(m)}
            options={[
              { value: 'all', label: 'All' },
              { value: 'minimal', label: 'Minimal' },
              { value: 'off', label: 'Off' },
            ]}
          />
        </ControlRow>

        <ToggleRow
          title="Reaction sounds"
          desc="Play a short sound on streaks and celebrations. Off by default."
          checked={reactionsAudio && reactionsMode !== 'off'}
          disabled={reactionsMode === 'off'}
          dimWhenOff
          onChange={(v) => {
            if (reactionsMode === 'off') return;
            void saveReactionsAudio(v);
          }}
        />

        {hapticsAvailable && (
          <ToggleRow
            title="Haptic feedback"
            desc="Subtle vibration on taps, answers, and celebrations. On by default."
            checked={hapticsPref}
            onChange={(v) => {
              setHapticsPref(v);
              setHapticsEnabled(v);
            }}
          />
        )}
      </SettingsCard>
    </SettingsShell>
  );
}
