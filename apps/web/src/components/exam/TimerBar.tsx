import * as React from 'react';

/* Exam Mode (Phase 0) — countdown timer bar for timed mock exams. Purely
   presentational: the parent owns the tick (via TimerContext) and passes the
   current `remainingSec`. Depletes left-to-right and shifts amber → red as it
   nears zero. Renders inside the cream AppShell. */

export interface TimerBarProps {
  /** Seconds left on the clock. Clamped to ≥ 0. */
  remainingSec: number;
  /** Total seconds the clock started at (for the depletion track). */
  totalSec: number;
  /** Amber-warning threshold in seconds (default 120). */
  warnSec?: number;
  /** Red-danger threshold in seconds (default 30). */
  dangerSec?: number;
  paused?: boolean;
  compact?: boolean;
}

function formatClock(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${mm}:${pad(sec)}`;
}

export function TimerBar({
  remainingSec,
  totalSec,
  warnSec = 120,
  dangerSec = 30,
  paused = false,
  compact = false,
}: TimerBarProps) {
  const remaining = Math.max(0, remainingSec);
  const total = Math.max(1, totalSec);
  const pct = Math.max(0, Math.min(100, (remaining / total) * 100));

  const tone =
    remaining <= dangerSec ? 'danger' : remaining <= warnSec ? 'warn' : 'ok';
  const fill =
    tone === 'danger' ? '#b4341f' : tone === 'warn' ? 'var(--amber)' : 'var(--primary)';
  const ink =
    tone === 'danger' ? '#b4341f' : tone === 'warn' ? 'var(--amber-ink)' : 'var(--ink)';

  return (
    <div
      role="timer"
      aria-label={`${formatClock(remaining)} remaining`}
      style={{ display: 'flex', flexDirection: 'column', gap: compact ? 5 : 7, width: '100%' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--body)',
          }}
        >
          <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 16 }}>
            {paused ? 'pause_circle' : 'timer'}
          </span>
          {paused ? 'Paused' : 'Time left'}
        </span>
        <span
          style={{
            fontSize: compact ? 16 : 20,
            fontWeight: 800,
            letterSpacing: '-0.01em',
            fontVariantNumeric: 'tabular-nums',
            color: ink,
          }}
        >
          {formatClock(remaining)}
        </span>
      </div>
      <div
        style={{
          width: '100%',
          height: compact ? 6 : 8,
          borderRadius: 999,
          background: '#eee7da',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${pct}%`,
            borderRadius: 999,
            background: paused ? 'var(--muted)' : fill,
            transition: 'width 0.9s linear, background-color 0.3s var(--ease)',
          }}
        />
      </div>
    </div>
  );
}

export default TimerBar;
