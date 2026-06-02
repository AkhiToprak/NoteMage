'use client';

import * as React from 'react';
import { Mascot } from '@/components/mascot/Mascot';
import type { MascotPose } from '@/components/mascot/poses';

/**
 * Shared empty-state primitive (audit item 11). Replaces 22+ ad-hoc empty
 * states that each picked their own muted color (--ink-40 / --outline /
 * --on-surface-variant) and structure. Render a Material Symbol icon OR a small
 * Mascot, a title, optional copy, and an optional CTA.
 *
 * `compact` is for tight spots (sidebar group placeholders) where a full mascot
 * would be too heavy — it shrinks the art and type and drops the bottom CTA gap.
 */
export interface EmptyStateProps {
  /** Material Symbol name. Ignored when `mascot` is set. */
  icon?: string;
  /** Mascot pose; takes precedence over `icon`. */
  mascot?: MascotPose;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  compact?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export function EmptyState({
  icon,
  mascot,
  title,
  description,
  action,
  compact = false,
  className,
  style,
}: EmptyStateProps) {
  return (
    <div
      className={className}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        gap: compact ? 8 : 12,
        padding: compact ? '20px 16px' : '40px 24px',
        ...style,
      }}
    >
      {mascot ? (
        <Mascot pose={mascot} size={compact ? 'xs' : 'sm'} idle={compact ? 'none' : 'sway'} />
      ) : icon ? (
        <span
          aria-hidden
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: compact ? 40 : 56,
            height: compact ? 40 : 56,
            borderRadius: 'var(--radius-full)',
            background: 'var(--brand-purple-wash)',
            color: 'var(--primary)',
            marginBottom: compact ? 0 : 2,
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: compact ? 22 : 28 }}>
            {icon}
          </span>
        </span>
      ) : null}

      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: compact ? 'var(--fs-sm)' : 'var(--fs-md)',
          fontWeight: 700,
          color: 'var(--on-surface)',
          lineHeight: 'var(--lh-snug)',
        }}
      >
        {title}
      </div>

      {description ? (
        <div
          style={{
            fontSize: compact ? 'var(--fs-xs)' : 'var(--fs-sm)',
            color: 'var(--text-secondary)',
            lineHeight: 'var(--lh-normal)',
            maxWidth: 320,
          }}
        >
          {description}
        </div>
      ) : null}

      {action ? <div style={{ marginTop: compact ? 4 : 8 }}>{action}</div> : null}
    </div>
  );
}
