'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { DashboardIcon, NotebookIcon, CoWorkIcon } from '@/components/icons/NavIcons';

/**
 * Phone-only bottom tab bar. Phones are used primarily for the Learn hub +
 * paths, so the four most-used destinations get thumb-reachable tabs; Settings
 * and Profile stay on the header avatar menu. Rendered as a flex sibling after
 * <main> in the dashboard layout, so it takes its own height and never overlaps
 * the scroll area. Hidden ≥768px via the co-located media query (SSR-safe — no
 * useBreakpoint, so no desktop-flash).
 */
type Tab = {
  href: string;
  label: string;
  icon: string | ((color: string) => ReactNode);
  /** Active when the path starts with this prefix (defaults to the href). */
  prefix?: string;
};

const TABS: Tab[] = [
  { href: '/dashboard', label: 'Home', icon: (c) => <DashboardIcon size={22} color={c} /> },
  { href: '/learn', label: 'Learn', icon: 'school' },
  { href: '/notebooks', label: 'Notebooks', icon: (c) => <NotebookIcon size={22} color={c} /> },
  { href: '/groups', label: 'Co-Work', icon: (c) => <CoWorkIcon size={22} color={c} /> },
];

const ACTIVE = '#ae89ff';
const INACTIVE = '#8888a8';

export default function MobileBottomNav() {
  const pathname = usePathname();

  const isActive = (tab: Tab) => {
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
        }}
      >
        {TABS.map((tab) => {
          const active = isActive(tab);
          const color = active ? ACTIVE : INACTIVE;
          return (
            <li key={tab.href} style={{ minWidth: 0 }}>
              <Link
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className="mbn-link"
                style={{
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
                }}
              >
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
      `}</style>
    </nav>
  );
}
