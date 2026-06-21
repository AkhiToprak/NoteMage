'use client';

import type { CSSProperties } from 'react';

export interface StatusBarProps {
  /** Clock text. Figma ships `9:41`. */
  time?: string;
  /** Ink color for glyphs + time (defaults to the current text color). */
  color?: string;
  style?: CSSProperties;
}

/**
 * Faux iOS status bar — the `9:41` + signal/wifi/battery row that the Figma
 * mobile frames include. Kept for fidelity (the plan's Known Gaps note); can be
 * hidden on real devices via `PhoneFrame showStatusBar={false}`.
 *
 * Note: re-drawn device chrome is normally a slop tell, but here the status bar
 * IS part of the design being reproduced 1:1, so it stays.
 */
export function StatusBar({ time = '9:41', color, style }: StatusBarProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: 44,
        padding: '0 22px',
        color: color ?? 'inherit',
        fontFamily: 'var(--font-sans)',
        fontSize: 15,
        fontWeight: 700,
        letterSpacing: '0.01em',
        flex: '0 0 auto',
        userSelect: 'none',
        ...style,
      }}
    >
      <span>{time}</span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span className="material-symbols-outlined filled" style={{ fontSize: 17 }}>
          signal_cellular_alt
        </span>
        <span className="material-symbols-outlined filled" style={{ fontSize: 17 }}>
          wifi
        </span>
        <span className="material-symbols-outlined filled" style={{ fontSize: 19 }}>
          battery_full
        </span>
      </span>
    </div>
  );
}
