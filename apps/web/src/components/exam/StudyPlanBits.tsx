'use client';

/* Exam Mode (Phase 4) — shared cream UI atoms for Today's Plan + Study Calendar
 * (Figma X2 Today's Study Plan 89:18190 web / 89:17089 mobile · X2 Study Calendar
 * 89:20014 web / 89:18448 mobile). Inline-styled against the AppShell `.shell`
 * cream tokens so both screens read as one surface; pure presentational + the
 * daily-time slider. Types come from the client-safe `exam-study-plan-core`. */

import * as React from 'react';
import { KIND_META, type PlanItemKind, type PlanItemStatus } from '@/lib/exam-study-plan-core';
import slider from './StudyPlanBits.module.css';

/** Per-kind chip tone (cream family — lilac study · amber review · gold mock · green final). */
const KIND_TONE: Record<'study' | 'review' | 'mock' | 'final', { bg: string; fg: string }> = {
  study: { bg: 'var(--lilac-soft)', fg: 'var(--accent)' },
  review: { bg: 'var(--amber-soft)', fg: 'var(--amber-ink)' },
  mock: { bg: 'var(--amber-soft)', fg: 'var(--amber-ink)' },
  final: { bg: 'var(--green-soft)', fg: 'var(--green-ink)' },
};

export function KindChip({ kind, label }: { kind: PlanItemKind; label?: string }) {
  const meta = KIND_META[kind];
  const tone = KIND_TONE[meta.tone];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        height: 24,
        padding: '0 10px',
        borderRadius: 999,
        background: tone.bg,
        color: tone.fg,
        fontSize: 11.5,
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}
    >
      <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 14 }}>
        {meta.icon}
      </span>
      {label ?? meta.label}
    </span>
  );
}

export function UrgencyBadge({ urgency }: { urgency: number | null }) {
  if (!urgency) return null;
  const label = urgency >= 3 ? 'Urgent' : urgency === 2 ? 'Needs practice' : 'Almost there';
  const tone =
    urgency >= 3
      ? { bg: 'var(--danger-soft)', fg: 'var(--danger-ink)' }
      : urgency === 2
        ? { bg: 'var(--amber-soft)', fg: 'var(--amber-ink)' }
        : { bg: 'var(--green-soft)', fg: 'var(--green-ink)' };
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height: 22,
        padding: '0 9px',
        borderRadius: 999,
        background: tone.bg,
        color: tone.fg,
        fontSize: 11,
        fontWeight: 700,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  );
}

const STATUS_META: Record<PlanItemStatus, { label: string; bg: string; fg: string }> = {
  not_started: { label: 'Not started', bg: 'var(--badge)', fg: 'var(--muted)' },
  in_progress: { label: 'In progress', bg: 'var(--lilac-soft)', fg: 'var(--accent)' },
  done: { label: 'Done', bg: 'var(--green-soft)', fg: 'var(--green-ink)' },
};

export function StatusPill({ status }: { status: PlanItemStatus }) {
  const m = STATUS_META[status];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height: 22,
        padding: '0 10px',
        borderRadius: 999,
        background: m.bg,
        color: m.fg,
        fontSize: 11,
        fontWeight: 700,
        whiteSpace: 'nowrap',
      }}
    >
      {m.label}
    </span>
  );
}

export function MinutesChip({ minutes }: { minutes: number }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12.5, fontWeight: 600, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
      <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 15 }}>
        schedule
      </span>
      {minutes} min
    </span>
  );
}

/**
 * The daily-study-time slider (calendar "Daily study time" card + plan "Adjust
 * time"). Drags update the local value live; release commits via `onCommit` so
 * the server re-buckets tasks once, not on every tick. Reduced-motion safe (no
 * transitions on the thumb).
 */
export function DailyTimeSlider({
  value,
  min = 20,
  max = 120,
  step = 5,
  busy = false,
  onCommit,
}: {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  busy?: boolean;
  onCommit: (value: number) => void;
}) {
  const [local, setLocal] = React.useState(value);
  React.useEffect(() => setLocal(value), [value]);
  const pct = Math.round(((local - min) / (max - min)) * 100);

  const commit = () => {
    if (local !== value) onCommit(local);
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{min} min</span>
        <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--accent)', letterSpacing: '-0.01em' }}>
          {local} min{busy ? '…' : ''}
        </span>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{max} min</span>
      </div>
      <div className={slider.slider}>
        <span className={slider.track} aria-hidden />
        <span className={slider.fill} aria-hidden style={{ width: `${pct}%` }} />
        <input
          type="range"
          className={slider.range}
          min={min}
          max={max}
          step={step}
          value={local}
          disabled={busy}
          aria-label="Daily study time in minutes"
          onChange={(e) => setLocal(Number(e.target.value))}
          onPointerUp={commit}
          onKeyUp={(e) => {
            if (e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End') commit();
          }}
        />
      </div>
    </div>
  );
}
