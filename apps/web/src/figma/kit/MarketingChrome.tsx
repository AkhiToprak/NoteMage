'use client';

import type { CSSProperties, ReactNode } from 'react';
import { Mage } from './Mage';
import { FButton } from './FButton';

export interface MarketingHeaderProps {
  links?: { key: string; label: string }[];
  cta?: ReactNode;
  style?: CSSProperties;
}

const DEFAULT_LINKS = [
  { key: 'features', label: 'Features' },
  { key: 'pricing', label: 'Pricing' },
  { key: 'about', label: 'About' },
  { key: 'docs', label: 'Docs' },
];

/** Public-site header. Refined against the Figma marketing frames in Phase 2. */
export function MarketingHeader({ links = DEFAULT_LINKS, cta, style }: MarketingHeaderProps) {
  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-8)',
        height: 76,
        padding: '0 var(--space-12)',
        ...style,
      }}
    >
      <Mage pose="logo" size={148} alt="NoteMage" />
      <nav style={{ display: 'flex', gap: 'var(--space-6)', marginLeft: 'var(--space-4)' }}>
        {links.map((l) => (
          <a
            key={l.key}
            href={`#${l.key}`}
            style={{ color: 'var(--ink-70)', fontSize: 'var(--fs-base)', fontWeight: 500, textDecoration: 'none' }}
          >
            {l.label}
          </a>
        ))}
      </nav>
      <div style={{ marginLeft: 'auto' }}>{cta ?? <FButton size="sm">Get started</FButton>}</div>
    </header>
  );
}

export interface MarketingFooterProps {
  style?: CSSProperties;
}

/** Public-site footer. Refined against the Figma marketing frames in Phase 2. */
export function MarketingFooter({ style }: MarketingFooterProps) {
  return (
    <footer
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 'var(--space-4)',
        padding: 'var(--space-12)',
        borderTop: '1px solid var(--ink-08)',
        color: 'var(--ink-50)',
        fontSize: 'var(--fs-sm)',
        ...style,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
        <Mage pose="icon" size={120} alt="NoteMage" />
      </div>
      <span>© NoteMage — design preview</span>
    </footer>
  );
}
