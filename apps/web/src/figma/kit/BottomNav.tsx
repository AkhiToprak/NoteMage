'use client';

import type { CSSProperties } from 'react';

export interface BottomNavTab {
  key: string;
  label: string;
  /** Material Symbols icon name. */
  icon: string;
}

export interface BottomNavProps {
  active: string;
  tabs?: BottomNavTab[];
  onSelect?: (key: string) => void;
  style?: CSSProperties;
}

/**
 * App-shell mobile tab bar. Default tabs are a sensible starting set; the exact
 * Figma tabs are dialed in when the Dashboard (Phase 3) is built. Sticks to the
 * bottom of its scroll container.
 */
const DEFAULT_TABS: BottomNavTab[] = [
  { key: 'home', label: 'Home', icon: 'home' },
  { key: 'paths', label: 'Paths', icon: 'route' },
  { key: 'practice', label: 'Practice', icon: 'fitness_center' },
  { key: 'progress', label: 'Progress', icon: 'trending_up' },
  { key: 'profile', label: 'Profile', icon: 'person' },
];

export function BottomNav({ active, tabs = DEFAULT_TABS, onSelect, style }: BottomNavProps) {
  return (
    <nav
      style={{
        display: 'flex',
        alignItems: 'stretch',
        justifyContent: 'space-around',
        gap: 2,
        padding: '8px 8px 10px',
        background: 'var(--surface-container-low)',
        borderTop: '1px solid var(--ink-08)',
        ...style,
      }}
    >
      {tabs.map((t) => {
        const isActive = t.key === active;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onSelect?.(t.key)}
            aria-current={isActive ? 'page' : undefined}
            style={{
              flex: 1,
              display: 'grid',
              justifyItems: 'center',
              gap: 2,
              padding: '6px 0',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: isActive ? 'var(--nm-primary)' : 'var(--ink-50)',
              borderRadius: 'var(--radius-md)',
            }}
          >
            <span
              className={isActive ? 'material-symbols-outlined filled' : 'material-symbols-outlined'}
              style={{ fontSize: 24 }}
            >
              {t.icon}
            </span>
            <span style={{ fontSize: 'var(--fs-2xs)', fontWeight: isActive ? 700 : 500 }}>
              {t.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
