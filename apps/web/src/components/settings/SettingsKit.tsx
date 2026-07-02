'use client';

import type { CSSProperties, ReactNode } from 'react';
import { haptics } from '@/lib/haptics';

/* Cream-native settings primitives. The redesign's shared ui.module.css covers
   page chrome (header, buttons, pills); this file adds the form-level pieces the
   settings screens need — cards, labelled inputs, a cream switch, a segmented
   control, and a status line — all reading from the AppShell `.shell` palette so
   they sit correctly on the warm surface (the legacy Switch/Toggle resolve their
   off-state tokens against the dark global theme and look wrong here). */

// ── Inputs ───────────────────────────────────────────────────────────────────

/** Base style for text inputs / textareas. Pair with className="set-input" for
 *  the focus ring injected by SettingsShell. */
export const settingsInput: CSSProperties = {
  width: '100%',
  padding: '12px 14px',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--rm)',
  color: 'var(--ink)',
  fontSize: '14.5px',
  fontFamily: 'inherit',
  outline: 'none',
  boxSizing: 'border-box',
};

export function FieldLabel({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label
      htmlFor={htmlFor}
      style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--ink-soft)', marginBottom: 8 }}
    >
      {children}
    </label>
  );
}

// ── Card + header ────────────────────────────────────────────────────────────

export function SettingsCard({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <section
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--rc)',
        boxShadow: 'var(--shadow)',
        padding: '22px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
        ...style,
      }}
    >
      {children}
    </section>
  );
}

type Tint = 'lilac' | 'amber' | 'green' | 'gold' | 'rose';

const TINTS: Record<Tint, { bg: string; fg: string }> = {
  lilac: { bg: 'var(--lilac-soft)', fg: 'var(--accent)' },
  amber: { bg: 'var(--amber-soft)', fg: 'var(--amber-ink)' },
  green: { bg: 'var(--green-soft)', fg: 'var(--green-ink)' },
  gold: { bg: 'var(--amber-soft)', fg: 'var(--amber-ink)' },
  rose: { bg: 'var(--danger-soft)', fg: 'var(--danger-ink)' },
};

export function CardHead({
  icon,
  title,
  desc,
  tint = 'lilac',
}: {
  icon: string;
  title: string;
  desc?: string;
  tint?: Tint;
}) {
  const t = TINTS[tint];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <span
        aria-hidden
        style={{
          width: 44,
          height: 44,
          borderRadius: 13,
          background: t.bg,
          color: t.fg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 23 }}>
          {icon}
        </span>
      </span>
      <div style={{ minWidth: 0 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>{title}</h2>
        {desc && <p style={{ margin: '3px 0 0', fontSize: 13, color: 'var(--body)', lineHeight: 1.5 }}>{desc}</p>}
      </div>
    </div>
  );
}

// ── Toggle (cream switch) ────────────────────────────────────────────────────

export function SettingsToggle({
  checked,
  onChange,
  disabled = false,
  ariaLabel,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => {
        if (disabled) return;
        haptics.select();
        onChange(!checked);
      }}
      className="set-switch"
      style={{
        position: 'relative',
        width: 44,
        height: 24,
        flexShrink: 0,
        borderRadius: 999,
        border: 'none',
        padding: 0,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        background: checked ? 'var(--primary)' : 'var(--switch-off, #e4ddcd)',
        transition: 'background-color 0.18s var(--ease)',
      }}
    >
      <span
        aria-hidden
        style={{
          position: 'absolute',
          top: 3,
          left: 3,
          width: 18,
          height: 18,
          borderRadius: 999,
          background: '#fff',
          boxShadow: '0 1px 3px rgba(24,32,47,0.28)',
          transform: checked ? 'translateX(20px)' : 'translateX(0)',
          transition: 'transform 0.18s var(--ease)',
        }}
      />
      <style>{`
        .set-switch:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
        [data-theme='dark'] .set-switch { --switch-off: #35355c; }
        @media (prefers-reduced-motion: reduce) {
          .set-switch, .set-switch > span { transition: none !important; }
        }
      `}</style>
    </button>
  );
}

/** A labelled row wrapping a SettingsToggle — the lilac-tinted setting row used
 *  across Appearance / Notifications. */
export function ToggleRow({
  title,
  desc,
  checked,
  onChange,
  disabled = false,
  dimWhenOff = false,
}: {
  title: string;
  desc?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  dimWhenOff?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 18,
        padding: '14px 16px',
        background: 'var(--lilac-soft)',
        borderRadius: 'var(--rm)',
        opacity: disabled && dimWhenOff ? 0.55 : 1,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 14.5, fontWeight: 600, color: 'var(--ink)' }}>{title}</p>
        {desc && <p style={{ margin: '3px 0 0', fontSize: 12.5, color: 'var(--body)', lineHeight: 1.5 }}>{desc}</p>}
      </div>
      <SettingsToggle checked={checked} onChange={onChange} disabled={disabled} ariaLabel={title} />
    </div>
  );
}

// ── Segmented control ────────────────────────────────────────────────────────

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: T; label: string; icon?: string }[];
  value: T;
  onChange: (next: T) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      style={{
        display: 'inline-flex',
        padding: 4,
        gap: 2,
        background: 'var(--lilac-soft)',
        border: '1px solid var(--border)',
        borderRadius: 999,
        flexShrink: 0,
      }}
    >
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={opt.label}
            onClick={() => {
              if (active) return;
              haptics.select();
              onChange(opt.value);
            }}
            className="set-press"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: opt.icon && !opt.label ? '7px 9px' : '7px 15px',
              borderRadius: 999,
              border: 'none',
              cursor: active ? 'default' : 'pointer',
              background: active ? 'var(--primary)' : 'transparent',
              color: active ? '#fff' : 'var(--ink-soft)',
              fontSize: 13.5,
              fontWeight: 600,
              fontFamily: 'inherit',
              transition: 'background-color 0.18s var(--ease), color 0.18s var(--ease)',
            }}
          >
            {opt.icon && (
              <span className="material-symbols-outlined" style={{ fontSize: 18 }} aria-hidden>
                {opt.icon}
              </span>
            )}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Status line ──────────────────────────────────────────────────────────────

export type StatusMsg = { type: 'error' | 'success'; msg: string } | null;

export function StatusLine({ status }: { status: StatusMsg }) {
  if (!status) return null;
  return (
    <p
      role={status.type === 'error' ? 'alert' : 'status'}
      style={{
        margin: 0,
        fontSize: 13.5,
        fontWeight: 600,
        color: status.type === 'success' ? 'var(--green-ink)' : 'var(--danger-ink)',
      }}
    >
      {status.msg}
    </p>
  );
}
