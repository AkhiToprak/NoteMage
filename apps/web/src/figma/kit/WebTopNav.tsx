'use client';

import type { CSSProperties, ReactNode } from 'react';
import { Mage } from './Mage';

export interface WebTopNavItem {
  key: string;
  label: string;
}

export interface WebTopNavProps {
  active?: string;
  items?: WebTopNavItem[];
  onSelect?: (key: string) => void;
  /** Right-aligned slot (avatar, actions). */
  actions?: ReactNode;
  style?: CSSProperties;
}

/**
 * App desktop header (signed-in shell). Default items are a starting set; the
 * exact Figma nav is dialed in when the web Dashboard (Phase 3) is built.
 */
const DEFAULT_ITEMS: WebTopNavItem[] = [
  { key: 'home', label: 'Home' },
  { key: 'paths', label: 'Learning paths' },
  { key: 'practice', label: 'Practice' },
  { key: 'progress', label: 'Progress' },
];

export function WebTopNav({ active, items = DEFAULT_ITEMS, onSelect, actions, style }: WebTopNavProps) {
  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-8)',
        height: 72,
        padding: '0 var(--space-8)',
        background: 'var(--surface-container-low)',
        borderBottom: '1px solid var(--ink-08)',
        ...style,
      }}
    >
      <Mage pose="logo" size={132} alt="NoteMage" />
      <nav style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        {items.map((it) => {
          const isActive = it.key === active;
          return (
            <button
              key={it.key}
              type="button"
              onClick={() => onSelect?.(it.key)}
              aria-current={isActive ? 'page' : undefined}
              style={{
                padding: '8px 14px',
                borderRadius: 'var(--radius-md)',
                border: 'none',
                background: isActive ? 'var(--ink-08)' : 'transparent',
                color: isActive ? 'var(--on-surface)' : 'var(--ink-60)',
                fontFamily: 'var(--font-sans)',
                fontSize: 'var(--fs-base)',
                fontWeight: isActive ? 700 : 500,
                cursor: 'pointer',
              }}
            >
              {it.label}
            </button>
          );
        })}
      </nav>
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
        {actions}
      </div>
    </header>
  );
}
