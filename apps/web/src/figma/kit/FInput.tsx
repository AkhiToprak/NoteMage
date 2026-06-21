'use client';

import { useId, type CSSProperties, type InputHTMLAttributes } from 'react';
import styles from './kit.module.css';

export interface FInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  /** Error message — also flips the input to the error treatment. */
  error?: string;
  /** Helper text under the field (hidden when `error` is set). */
  hint?: string;
  /** Wrapper style (the field itself is styled by the module). */
  wrapperStyle?: CSSProperties;
}

/**
 * Kit text input — controlled, label + hint/error, focus ring. Forms in the
 * figma screens are controlled but never submit (mock-only).
 */
export function FInput({
  label,
  error,
  hint,
  id,
  className,
  wrapperStyle,
  ...rest
}: FInputProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const describedBy = error ? `${inputId}-err` : hint ? `${inputId}-hint` : undefined;
  const cls = [styles.input, error ? styles.inputError : null, className].filter(Boolean).join(' ');
  return (
    <div style={{ display: 'grid', gap: 6, ...wrapperStyle }}>
      {label && (
        <label
          htmlFor={inputId}
          style={{
            fontSize: 'var(--fs-sm)',
            fontWeight: 600,
            color: 'var(--on-surface-variant)',
          }}
        >
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={cls}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...rest}
      />
      {error ? (
        <span id={`${inputId}-err`} style={{ fontSize: 'var(--fs-xs)', color: 'var(--error)' }}>
          {error}
        </span>
      ) : hint ? (
        <span id={`${inputId}-hint`} style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-50)' }}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}
