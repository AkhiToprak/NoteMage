'use client';

import * as React from 'react';
import { useBreakpoint } from '@/hooks/useBreakpoint';

/**
 * Replaces the old icon-list "About" card. New shape: definition-list of
 * label/value rows separated by a hairline. No icons, no eyebrow labels,
 * sentence-case heading. Lives in the asymmetric bottom row alongside
 * the Social card.
 *
 * On phone the row stacks (label above value), on desktop they sit on
 * the same line with the value right-aligned.
 */
interface AboutLadderRow {
  key: string;
  label: string;
  value: React.ReactNode;
}

interface AboutLadderProps {
  rows: AboutLadderRow[];
  /** Optional section heading. Pass undefined to render headless. */
  heading?: string;
}

export function AboutLadder({ rows, heading = 'About' }: AboutLadderProps) {
  const { isPhone } = useBreakpoint();

  if (rows.length === 0) return null;

  return (
    <div
      style={{
        background: 'var(--surface-container-low)',
        borderRadius: 'var(--radius-lg)',
        padding: isPhone ? '20px' : '24px 28px',
        height: '100%',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {heading && (
        <h2
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '18px',
            fontWeight: 700,
            letterSpacing: '-0.01em',
            color: 'var(--on-surface)',
            margin: '0 0 16px',
          }}
        >
          {heading}
        </h2>
      )}
      <dl
        style={{
          margin: 0,
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {rows.map((row, i) => (
          <div
            key={row.key}
            style={{
              display: 'flex',
              flexDirection: isPhone ? 'column' : 'row',
              alignItems: isPhone ? 'flex-start' : 'baseline',
              gap: isPhone ? '2px' : '16px',
              padding: '12px 0',
              borderTop: i === 0 ? 'none' : '1px solid var(--rule-hairline)',
            }}
          >
            <dt
              style={{
                margin: 0,
                fontSize: '13px',
                fontWeight: 500,
                color: 'var(--on-surface-variant)',
                flexShrink: 0,
                minWidth: isPhone ? 'auto' : '92px',
              }}
            >
              {row.label}
            </dt>
            <dd
              style={{
                margin: 0,
                fontSize: '14px',
                fontWeight: 600,
                color: 'var(--on-surface)',
                textAlign: isPhone ? 'left' : 'right',
                flex: 1,
                minWidth: 0,
                overflowWrap: 'anywhere',
              }}
            >
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
