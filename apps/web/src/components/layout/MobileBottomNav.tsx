'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { haptics } from '@/lib/haptics';
import { useOptionalMage } from '@/components/mage';

/**
 * Phone-only bottom tab bar. Five tabs: four icon+label destinations plus a
 * center circular Upload FAB. Rendered as a flex sibling after <main> in the
 * dashboard layout so it never overlaps the scroll area. Hidden ≥768px via
 * the co-located media query (SSR-safe — no useBreakpoint, so no desktop flash).
 */
type Tab = {
  href?: string;
  label: string;
  icon: string | ((color: string) => ReactNode);
  /** Active when the path starts with this prefix (defaults to the href). */
  prefix?: string;
  /** Renders as a prominent center FAB instead of a standard tab. */
  isPrimary?: boolean;
  /** Phase 10 — a non-route tab that opens the global Mage panel in place. */
  action?: 'open-mage';
};

const TABS: Tab[] = [
  { href: '/dashboard',      label: 'Home',     icon: 'cottage' },
  { href: '/my-path',        label: 'My Paths', icon: 'route' },
  { href: '/paths/new',      label: 'Create', icon: 'add', isPrimary: true },
  { label: 'Mage',           icon: 'auto_fix_high', action: 'open-mage' },
];

const ACTIVE = '#ae89ff';
const INACTIVE = '#8888a8';

export default function MobileBottomNav() {
  const pathname = usePathname();
  const mage = useOptionalMage();

  const isActive = (tab: Tab) => {
    // FABs + the panel-opening Mage tab never read as a route-active tab.
    if (tab.isPrimary || tab.action || !tab.href) return false;
    const prefix = tab.prefix ?? tab.href;
    return pathname === tab.href || pathname.startsWith(prefix + '/') || pathname.startsWith(prefix);
  };

  return (
    <nav className="mobile-bottom-nav" aria-label="Primary">
      <ul
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          display: 'grid',
          gridTemplateColumns: `repeat(${TABS.length}, minmax(0, 1fr))`,
          alignItems: 'center',
        }}
      >
        {TABS.map((tab) => {
          const active = isActive(tab);
          const color = active ? ACTIVE : INACTIVE;

          if (tab.isPrimary) {
            // Center Upload FAB — floats above the bar with a circle button
            return (
              <li
                key={tab.href}
                style={{
                  minWidth: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  // Lift above the bar so the circle peeks over the top edge
                  position: 'relative',
                  top: -14,
                }}
              >
                <Link
                  href={tab.href!}
                  aria-label={tab.label}
                  onClick={() => haptics.select()}
                  className="mbn-fab"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 56,
                    height: 56,
                    borderRadius: '50%',
                    background: 'var(--accent-strong, #884efb)',
                    color: '#ffffff',
                    textDecoration: 'none',
                    boxShadow:
                      '0 4px 12px rgba(136,78,251,0.45), 0 1px 3px rgba(0,0,0,0.3)',
                    transition: 'transform 0.18s cubic-bezier(0.22,1,0.36,1), box-shadow 0.18s cubic-bezier(0.22,1,0.36,1)',
                  }}
                >
                  <span
                    className="material-symbols-outlined"
                    style={{ fontSize: 28, fontVariationSettings: '"FILL" 1' }}
                  >
                    {tab.icon as string}
                  </span>
                </Link>
              </li>
            );
          }

          const tabInner = (
            <>
              {typeof tab.icon === 'string' ? (
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 24, fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0" }}
                >
                  {tab.icon}
                </span>
              ) : (
                tab.icon(color)
              )}
              <span
                style={{
                  fontSize: 11,
                  fontWeight: active ? 700 : 500,
                  letterSpacing: '-0.01em',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxWidth: '100%',
                }}
              >
                {tab.label}
              </span>
            </>
          );

          const tabStyle = {
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 3,
            minHeight: 56,
            padding: '8px 4px',
            textDecoration: 'none',
            color,
            transition: 'color 0.18s cubic-bezier(0.22,1,0.36,1)',
          } as const;

          // The Mage tab opens the global panel in place rather than navigating.
          if (tab.action === 'open-mage') {
            return (
              <li key={tab.label} style={{ minWidth: 0 }}>
                <button
                  type="button"
                  aria-label={tab.label}
                  onClick={() => {
                    haptics.select();
                    mage?.open();
                  }}
                  className="mbn-link"
                  style={{
                    ...tabStyle,
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    width: '100%',
                  }}
                >
                  {tabInner}
                </button>
              </li>
            );
          }

          return (
            <li key={tab.href} style={{ minWidth: 0 }}>
              <Link
                href={tab.href!}
                aria-current={active ? 'page' : undefined}
                onClick={() => {
                  if (!active) haptics.select();
                }}
                className="mbn-link"
                style={tabStyle}
              >
                {tabInner}
              </Link>
            </li>
          );
        })}
      </ul>

      <style>{`
        /* Hidden by default (renders server-side this way → no desktop flash);
           only shown on phone widths. */
        .mobile-bottom-nav {
          display: none;
          flex-shrink: 0;
          border-top: 1px solid var(--outline-variant);
          background: color-mix(in srgb, var(--background) 92%, transparent);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          padding-bottom: env(safe-area-inset-bottom, 0px);
          /* Extra top room so the FAB circle doesn't get clipped */
          overflow: visible;
        }
        @media (max-width: 767px) {
          .mobile-bottom-nav { display: block; }
        }
        .mbn-link:active { transform: scale(0.96); }
        .mbn-link:focus-visible {
          outline: 2px solid var(--color-focus);
          outline-offset: -2px;
          border-radius: 8px;
        }
        .mbn-fab:active { transform: scale(0.91); }
        .mbn-fab:focus-visible {
          outline: 2px solid var(--color-focus);
          outline-offset: 3px;
        }
        .mbn-fab:hover {
          box-shadow: 0 6px 16px rgba(136,78,251,0.55), 0 2px 4px rgba(0,0,0,0.3);
          transform: translateY(-1px);
        }
      `}</style>
    </nav>
  );
}
