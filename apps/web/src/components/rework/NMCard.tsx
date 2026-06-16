'use client';

import * as React from 'react';
import type { NodeType } from './tokens';
import { NODE_META } from './tokens';
import styles from './NMCard.module.css';

export interface NMCardProps {
  children?: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
  onClick?: React.MouseEventHandler;
  interactive?: boolean;
  /** Adds a 4px left accent strip in the matching semantic color. */
  accent?: NodeType | 'streak' | 'none';
  /** HTML element to render as (default 'div'; overridden to 'button' when interactive). */
  as?: keyof React.JSX.IntrinsicElements;
}

function accentColor(accent: NonNullable<NMCardProps['accent']>): string {
  if (accent === 'streak') return 'var(--nm-streak)';
  if (accent === 'none') return 'transparent';
  return NODE_META[accent].color;
}

export function NMCard({
  children,
  style,
  className,
  onClick,
  interactive = false,
  accent,
  as,
}: NMCardProps) {
  const hasAccent = accent && accent !== 'none';
  const Tag = (as ?? (interactive ? 'button' : 'div')) as React.ElementType;

  const classNames = [
    styles.card,
    interactive ? styles.interactive : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  const extraProps: Record<string, unknown> = {};
  if (Tag === 'button') {
    extraProps.type = 'button';
  }

  return (
    <Tag
      className={classNames}
      onClick={onClick}
      style={{
        paddingLeft: hasAccent ? 'calc(var(--card-pad, 24px) + 4px)' : undefined,
        ...style,
      }}
      {...extraProps}
    >
      {hasAccent && (
        <span
          aria-hidden
          className={styles.accentStrip}
          style={{ background: accentColor(accent) }}
        />
      )}
      {children}
    </Tag>
  );
}

export default NMCard;
