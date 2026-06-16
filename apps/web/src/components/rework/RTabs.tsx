'use client';

import * as React from 'react';

export interface RTab {
  key: string;
  label: string;
}

export interface RTabsProps {
  tabs: RTab[];
  activeKey: string;
  onChange: (key: string) => void;
  ariaLabel?: string;
}

export function RTabs({ tabs, activeKey, onChange, ariaLabel }: RTabsProps) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        background: 'var(--surface-container)',
        border: '1px solid var(--rule-hairline)',
        borderRadius: 'var(--radius-full)',
        padding: 4,
        gap: 4,
      }}
    >
      {tabs.map((tab) => {
        const isActive = tab.key === activeKey;
        return (
          <RTabButton
            key={tab.key}
            tab={tab}
            isActive={isActive}
            onClick={() => onChange(tab.key)}
          />
        );
      })}
    </div>
  );
}

interface RTabButtonProps {
  tab: RTab;
  isActive: boolean;
  onClick: () => void;
}

function RTabButton({ tab, isActive, onClick }: RTabButtonProps) {
  const [hovered, setHovered] = React.useState(false);

  const bg = isActive
    ? 'var(--accent-strong)'
    : hovered
      ? 'var(--ink-08)'
      : 'transparent';

  const color = isActive ? 'var(--on-primary-container)' : 'var(--on-surface-variant)';

  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 36,
        padding: '8px 16px',
        borderRadius: 'var(--radius-full)',
        border: 'none',
        background: bg,
        color,
        fontSize: 'var(--fs-sm)',
        fontWeight: 600,
        fontFamily: 'var(--font-sans)',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        transition: `background var(--dur-fast), color var(--dur-fast), transform var(--dur-fast)`,
        outline: 'none',
        WebkitTapHighlightColor: 'transparent',
      }}
      // :focus-visible ring handled via the style below — we can't use CSS pseudo selectors in
      // inline styles, so we attach a className for focus-visible only.
      onFocus={(e) => {
        if (e.target.matches(':focus-visible')) {
          (e.target as HTMLButtonElement).style.outline = '3px solid var(--accent-strong)';
          (e.target as HTMLButtonElement).style.outlineOffset = '3px';
        }
      }}
      onBlur={(e) => {
        (e.target as HTMLButtonElement).style.outline = 'none';
        (e.target as HTMLButtonElement).style.outlineOffset = '0';
      }}
    >
      {tab.label}
    </button>
  );
}

export default RTabs;
