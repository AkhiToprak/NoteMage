import * as React from 'react';

/* Exam Mode (Phase 0) — gate badge. Shows the pass-gate state of an assessment
   node (the 70%-to-pass gate + retake flow from the slot-kind composition
   rules). Presentational; renders inside the cream AppShell. */

export type GateState = 'locked' | 'required' | 'passed' | 'failed';

export interface GateBadgeProps {
  state: GateState;
  /** Pass threshold percent for the assessment gate, e.g. 70. */
  threshold?: number;
  size?: 'sm' | 'md';
}

interface GateConfig {
  icon: string;
  label: (threshold?: number) => string;
  bg: string;
  ink: string;
}

const GATE_CONFIG: Record<GateState, GateConfig> = {
  locked: { icon: 'lock', label: () => 'Locked', bg: '#efeade', ink: 'var(--body)' },
  required: {
    icon: 'flag',
    label: (t) => (typeof t === 'number' ? `${Math.round(t)}% to pass` : 'Pass to continue'),
    bg: 'var(--amber-soft)',
    ink: 'var(--amber-ink)',
  },
  passed: { icon: 'check_circle', label: () => 'Passed', bg: 'var(--green-soft)', ink: 'var(--green-ink)' },
  // The cream shell has no red token; this soft red matches --error (#c0392b).
  failed: { icon: 'replay', label: () => 'Retake', bg: '#fdecea', ink: '#b4341f' },
};

export function GateBadge({ state, threshold, size = 'md' }: GateBadgeProps) {
  const cfg = GATE_CONFIG[state];
  const isSm = size === 'sm';

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        borderRadius: 999,
        padding: isSm ? '3px 9px' : '5px 11px',
        background: cfg.bg,
        color: cfg.ink,
        fontSize: isSm ? 12 : 12.5,
        fontWeight: 600,
        lineHeight: 1,
        whiteSpace: 'nowrap',
        userSelect: 'none',
      }}
    >
      <span className="material-symbols-outlined" aria-hidden style={{ fontSize: isSm ? 14 : 15, lineHeight: 1 }}>
        {cfg.icon}
      </span>
      {cfg.label(threshold)}
    </span>
  );
}

export default GateBadge;
