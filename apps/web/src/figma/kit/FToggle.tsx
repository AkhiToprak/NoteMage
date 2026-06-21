'use client';

import styles from './kit.module.css';

export interface FToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  /** Accessible label (visually hidden) — required for icon-only toggles. */
  label: string;
  className?: string;
}

/** Kit switch — settings toggles (local state only). */
export function FToggle({ checked, onChange, disabled = false, label, className }: FToggleProps) {
  const cls = [styles.toggle, checked ? styles.toggleOn : null, className]
    .filter(Boolean)
    .join(' ');
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={cls}
      onClick={() => onChange(!checked)}
    >
      <span className={[styles.toggleKnob, checked ? styles.toggleKnobOn : null].filter(Boolean).join(' ')} />
    </button>
  );
}
