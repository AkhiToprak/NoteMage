'use client';

import type { CSSProperties, ReactNode } from 'react';
import styles from './kit.module.css';

export interface FChipProps {
  children: ReactNode;
  selected?: boolean;
  /** Material Symbols icon name shown before the label. */
  icon?: string;
  onClick?: () => void;
  /** Render as a static label (no button semantics) when there's no handler. */
  as?: 'button' | 'span';
  className?: string;
  style?: CSSProperties;
  'aria-pressed'?: boolean;
}

/** Kit chip / pill — selectable (source type, goal, intensity, tags). */
export function FChip({
  children,
  selected = false,
  icon,
  onClick,
  as,
  className,
  style,
  ...rest
}: FChipProps) {
  const cls = [styles.chip, selected ? styles.chipSelected : null, className]
    .filter(Boolean)
    .join(' ');
  const content = (
    <>
      {icon && (
        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
          {icon}
        </span>
      )}
      {children}
    </>
  );
  const Tag = as ?? (onClick ? 'button' : 'span');
  if (Tag === 'button') {
    return (
      <button
        type="button"
        className={cls}
        onClick={onClick}
        aria-pressed={selected}
        style={style}
        {...rest}
      >
        {content}
      </button>
    );
  }
  return (
    <span className={cls} style={style} {...rest}>
      {content}
    </span>
  );
}
