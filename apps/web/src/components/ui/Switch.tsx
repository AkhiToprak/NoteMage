'use client';

import * as React from 'react';
import { haptics } from '@/lib/haptics';

/**
 * Tokenised on/off switch. 44×24 pill, knob slides 0 → 20px.
 *
 * Replaces the two hand-rolled toggles in the /profile self-edit page
 * (privacy + hide-achievements) which inlined a #ae89ff fill and a
 * #3a3a5c off-state that don't exist as design tokens. This version
 * consumes brand-purple / surface tokens so light theme works for free
 * and future surfaces can drop it in without restyling.
 *
 * Eight-state coverage per Hallmark spec:
 *  - default, hover, :focus-visible, :active, disabled, checked, unchecked
 *  - loading/error/success are out-of-scope for a binary toggle; the
 *    parent form owns those.
 */
interface SwitchProps {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  disabled?: boolean;
  /** Visually-hidden label for screen readers. */
  'aria-label'?: string;
  /** Pairs with a separate <label> when omitted. */
  id?: string;
}

export function Switch({
  checked,
  onCheckedChange,
  disabled = false,
  'aria-label': ariaLabel,
  id,
}: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => {
        if (!disabled) {
          haptics.select();
          onCheckedChange(!checked);
        }
      }}
      className="hl-switch"
      data-checked={checked ? 'true' : 'false'}
      style={{
        width: '44px',
        height: '24px',
        borderRadius: '12px',
        border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        position: 'relative',
        padding: 0,
        background: checked
          ? 'var(--brand-purple-strong)'
          : 'var(--surface-container-highest)',
        opacity: disabled ? 0.5 : 1,
        transition: 'background-color var(--dur-fast) var(--ease-spring)',
        outline: 'none',
        flexShrink: 0,
      }}
    >
      <span
        aria-hidden
        style={{
          display: 'block',
          width: '18px',
          height: '18px',
          borderRadius: '50%',
          background: 'var(--switch-knob)',
          position: 'absolute',
          top: '3px',
          left: '3px',
          transform: checked ? 'translateX(20px)' : 'translateX(0)',
          transition: 'transform var(--dur-fast) var(--ease-spring)',
          boxShadow: 'var(--switch-knob-shadow)',
        }}
      />
      {/* Focus ring is painted via a sibling pseudo so the knob's transform
          doesn't drag it. Lives in globals.css under .hl-switch — applied
          here via the class. */}
      <style>{`
        .hl-switch:focus-visible {
          outline: var(--color-focus) solid 2px;
          outline-offset: 2px;
        }
        @media (prefers-reduced-motion: reduce) {
          .hl-switch, .hl-switch > span {
            transition: none !important;
          }
        }
      `}</style>
    </button>
  );
}
