'use client';

import * as React from 'react';
import { haptics } from '@/lib/haptics';

/**
 * Shared button primitive — the single home for the project's button hierarchy
 * and accent discipline (audit items 5/7/10/16). Before this, every screen
 * re-implemented buttons inline and hardcoded `#ae89ff` on secondary actions,
 * so accent had no meaning. Here accent lives in ONE variant (`primary`); the
 * quiet variants (`secondary`, `ghost`) carry no accent at all.
 *
 * Variants:
 *  - primary   — the one filled accent CTA per view (--accent-strong).
 *  - secondary — neutral surface chip, hairline border. No accent.
 *  - ghost     — transparent, muted text; for toolbars / low-emphasis actions.
 *  - danger    — quiet destructive (outline error), fills on hover.
 *
 * Keyboard focus is intentionally left to the global :focus-visible ring in
 * globals.css — we never set `outline: none`. Hover/active use spring easing on
 * transform/box-shadow only (never `transition-all`).
 */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';
type Shape = 'rounded' | 'pill';

const SIZES: Record<
  Size,
  { padding: string; fontSize: string; icon: number; gap: number; minHeight: number }
> = {
  sm: { padding: '6px 12px', fontSize: 'var(--fs-xs)', icon: 16, gap: 6, minHeight: 32 },
  md: { padding: '9px 16px', fontSize: 'var(--fs-sm)', icon: 18, gap: 8, minHeight: 40 },
  lg: { padding: '12px 20px', fontSize: 'var(--fs-base)', icon: 20, gap: 8, minHeight: 48 },
};

interface VariantStyle {
  rest: React.CSSProperties;
  hover: React.CSSProperties;
}

function variantStyle(v: Variant): VariantStyle {
  switch (v) {
    case 'primary':
      return {
        rest: {
          background: 'var(--accent-strong)',
          color: 'var(--on-primary-container)',
          border: '1px solid transparent',
          boxShadow: '0 1px 2px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.18)',
        },
        hover: {
          boxShadow:
            '0 6px 18px rgb(var(--accent-strong-rgb) / 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.22)',
        },
      };
    case 'secondary':
      return {
        rest: {
          background: 'var(--surface-container-high)',
          color: 'var(--on-surface)',
          border: '1px solid var(--ink-08)',
        },
        hover: { background: 'var(--surface-container-highest)' },
      };
    case 'ghost':
      return {
        rest: {
          background: 'transparent',
          color: 'var(--on-surface-variant)',
          border: '1px solid transparent',
        },
        hover: { background: 'var(--ink-08)', color: 'var(--on-surface)' },
      };
    case 'danger':
      return {
        rest: {
          background: 'transparent',
          color: 'var(--error)',
          border: '1px solid color-mix(in srgb, var(--error) 40%, transparent)',
        },
        hover: { background: 'color-mix(in srgb, var(--error) 14%, transparent)' },
      };
  }
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  shape?: Shape;
  /** Material Symbol name rendered before the label. */
  leadingIcon?: string;
  /** Material Symbol name rendered after the label. */
  trailingIcon?: string;
  /** Shows a spinner and disables interaction. */
  loading?: boolean;
  fullWidth?: boolean;
  /**
   * Haptic fired on press (native shell only; see @/lib/haptics). Defaults to a
   * light `tap`. Pass `false` to silence noisy/repeated buttons, or a semantic
   * intent (`success`/`error`) for a button whose press is itself an outcome.
   */
  haptic?: false | 'tap' | 'select' | 'success' | 'error';
  /** Tutorial-system target hook (passed through to the DOM button). */
  'data-tutorial'?: string;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size = 'md',
    shape = 'rounded',
    leadingIcon,
    trailingIcon,
    loading = false,
    fullWidth = false,
    haptic = 'tap',
    disabled,
    children,
    style,
    type = 'button',
    onMouseEnter,
    onMouseLeave,
    onMouseDown,
    onMouseUp,
    onPointerDown,
    ...rest
  },
  ref
) {
  const [hover, setHover] = React.useState(false);
  const [pressed, setPressed] = React.useState(false);
  const sz = SIZES[size];
  const vs = variantStyle(variant);
  const isDisabled = disabled || loading;
  const lifted = !isDisabled && hover && !pressed;

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      onMouseEnter={(e) => {
        setHover(true);
        onMouseEnter?.(e);
      }}
      onMouseLeave={(e) => {
        setHover(false);
        setPressed(false);
        onMouseLeave?.(e);
      }}
      onMouseDown={(e) => {
        setPressed(true);
        onMouseDown?.(e);
      }}
      onMouseUp={(e) => {
        setPressed(false);
        onMouseUp?.(e);
      }}
      onPointerDown={(e) => {
        // Fire on pointerdown (not click) so the buzz lands the instant the
        // finger touches — the helper coalesces any synthesized mouse event.
        if (!isDisabled && haptic) {
          if (haptic === 'select') haptics.select();
          else if (haptic === 'success') haptics.success();
          else if (haptic === 'error') haptics.error();
          else haptics.tap();
        }
        onPointerDown?.(e);
      }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: sz.gap,
        padding: sz.padding,
        minHeight: sz.minHeight,
        width: fullWidth ? '100%' : undefined,
        borderRadius: shape === 'pill' ? '999px' : 'var(--radius-md)',
        fontFamily: 'var(--font-sans)',
        fontSize: sz.fontSize,
        fontWeight: 600,
        lineHeight: 1,
        whiteSpace: 'nowrap',
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        opacity: isDisabled ? 0.55 : 1,
        transform: lifted ? 'translateY(-1px)' : 'translateY(0)',
        transition:
          'transform var(--dur-fast) var(--ease-spring), background-color var(--dur-fast) var(--ease-spring), box-shadow var(--dur-fast) var(--ease-spring), color var(--dur-fast) var(--ease-spring)',
        ...vs.rest,
        ...(hover && !isDisabled ? vs.hover : null),
        ...style,
      }}
      {...rest}
    >
      {loading ? (
        <span
          className="material-symbols-outlined nm-spin"
          aria-hidden
          style={{ fontSize: sz.icon }}
        >
          progress_activity
        </span>
      ) : leadingIcon ? (
        <span className="material-symbols-outlined" aria-hidden style={{ fontSize: sz.icon }}>
          {leadingIcon}
        </span>
      ) : null}
      {children != null && children !== false && <span>{children}</span>}
      {trailingIcon && !loading ? (
        <span className="material-symbols-outlined" aria-hidden style={{ fontSize: sz.icon }}>
          {trailingIcon}
        </span>
      ) : null}
    </button>
  );
});
