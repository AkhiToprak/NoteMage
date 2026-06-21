'use client';

import type { CSSProperties, ReactNode } from 'react';
import styles from './kit.module.css';

export interface FCardProps {
  children: ReactNode;
  /** Adds hover-lift + focus ring and renders as a button. */
  interactive?: boolean;
  /** Floating elevation shadow. */
  elevated?: boolean;
  /** Inner padding (token or px). Defaults to --card-pad. */
  padding?: number | string;
  /** Override the surface background. */
  background?: string;
  onClick?: () => void;
  className?: string;
  style?: CSSProperties;
  'aria-label'?: string;
}

/** Kit surface card — base/elevated/interactive layering. */
export function FCard({
  children,
  interactive = false,
  elevated = false,
  padding = 'var(--card-pad)',
  background,
  onClick,
  className,
  style,
  ...rest
}: FCardProps) {
  const cls = [styles.card, interactive ? styles.cardInteractive : null, className]
    .filter(Boolean)
    .join(' ');
  const merged: CSSProperties = {
    padding,
    ...(background ? { background } : null),
    ...(elevated
      ? { boxShadow: '0 8px 32px rgba(174,137,255,0.06), 0 2px 8px rgba(0,0,0,0.3)' }
      : null),
    ...style,
  };
  if (interactive) {
    return (
      <button type="button" className={cls} style={merged} onClick={onClick} {...rest}>
        {children}
      </button>
    );
  }
  return (
    <div className={cls} style={merged} {...rest}>
      {children}
    </div>
  );
}
