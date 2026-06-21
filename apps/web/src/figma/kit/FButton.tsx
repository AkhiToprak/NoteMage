'use client';

import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';
import styles from './kit.module.css';

export type FButtonVariant = 'primary' | 'secondary' | 'ghost' | 'gold' | 'danger';
export type FButtonSize = 'sm' | 'md' | 'lg';

export interface FButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: FButtonVariant;
  size?: FButtonSize;
  /** Full-width. */
  block?: boolean;
  /** Show a spinner and block interaction. */
  loading?: boolean;
  /** Material Symbols icon name rendered before the label. */
  leadingIcon?: string;
  /** Material Symbols icon name rendered after the label. */
  trailingIcon?: string;
  children?: ReactNode;
}

/** Per-variant color tokens fed to kit.module.css via CSS custom properties. */
const VARIANT_VARS: Record<FButtonVariant, CSSProperties> = {
  primary: {
    ['--fb-bg' as string]: 'var(--nm-primary)',
    ['--fb-fg' as string]: 'var(--on-primary-container)',
    ['--fb-bg-hover' as string]: 'var(--nm-primary-dark)',
  },
  secondary: {
    ['--fb-bg' as string]: 'var(--surface-container-high)',
    ['--fb-fg' as string]: 'var(--on-surface)',
    ['--fb-bg-hover' as string]: 'var(--surface-container-highest)',
    ['--fb-border' as string]: 'var(--ink-12)',
  },
  ghost: {
    ['--fb-bg' as string]: 'transparent',
    ['--fb-fg' as string]: 'var(--on-surface)',
    ['--fb-bg-hover' as string]: 'var(--ink-08)',
  },
  gold: {
    ['--fb-bg' as string]: 'var(--nm-accent)',
    ['--fb-fg' as string]: 'var(--nm-accent-ink)',
    ['--fb-bg-hover' as string]: 'var(--nm-streak)',
  },
  danger: {
    ['--fb-bg' as string]: 'var(--error-container)',
    ['--fb-fg' as string]: 'var(--on-error-container)',
    ['--fb-bg-hover' as string]: 'var(--error)',
  },
};

const SIZE_STYLE: Record<FButtonSize, CSSProperties> = {
  sm: { height: 38, padding: '0 16px', fontSize: 'var(--fs-sm)' },
  md: { height: 48, padding: '0 22px', fontSize: 'var(--fs-md)' },
  lg: { height: 56, padding: '0 28px', fontSize: 'var(--fs-lg)' },
};

const ICON_SIZE: Record<FButtonSize, number> = { sm: 18, md: 20, lg: 22 };

/**
 * Kit button — token-themed, all interaction states (hover/focus-visible/active/
 * disabled/loading) handled in kit.module.css. Faithful baseline for the figma
 * screens; a screen may swap to the app's `Button` if it matches the Figma frame.
 */
export function FButton({
  variant = 'primary',
  size = 'md',
  block = false,
  loading = false,
  leadingIcon,
  trailingIcon,
  disabled,
  className,
  style,
  children,
  ...rest
}: FButtonProps) {
  const cls = [styles.btn, block ? styles.btnBlock : null, className].filter(Boolean).join(' ');
  const iconPx = ICON_SIZE[size];
  return (
    <button
      type="button"
      className={cls}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      style={{ ...VARIANT_VARS[variant], ...SIZE_STYLE[size], ...style }}
      {...rest}
    >
      {loading ? (
        <span className={styles.spinner} aria-hidden />
      ) : (
        leadingIcon && (
          <span className="material-symbols-outlined" style={{ fontSize: iconPx }}>
            {leadingIcon}
          </span>
        )
      )}
      {children}
      {!loading && trailingIcon && (
        <span className="material-symbols-outlined" style={{ fontSize: iconPx }}>
          {trailingIcon}
        </span>
      )}
    </button>
  );
}
