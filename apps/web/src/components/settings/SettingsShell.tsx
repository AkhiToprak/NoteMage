'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import AppShell from '@/components/app/AppShell';
import ui from '@/components/app/ui.module.css';

/**
 * Cream scaffold shared by every dedicated settings screen.
 *
 * Each setting in /profile links to its own route (/settings/account,
 * /settings/appearance, …). This shell renders that page's chrome: the
 * "← Profile / <section>" breadcrumb (the back-to-profile path the redesign
 * calls for) plus the page title, inside the warm AppShell. Pages drop their
 * cards into `children`.
 *
 * It also injects the page-local focus / hover styles the kit's inputs and
 * link rows reference by class, so each settings page gets them for free.
 */
export default function SettingsShell({
  label,
  title,
  subtitle,
  children,
}: {
  /** Section name shown as the breadcrumb leaf and (by default) the H1. */
  label: string;
  /** Overrides the H1 when it should read differently from the breadcrumb. */
  title?: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <AppShell>
      <div style={{ maxWidth: 800 }}>
        <nav
          aria-label="Breadcrumb"
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5, marginBottom: 16 }}
        >
          <Link
            href="/profile"
            className="set-press"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              color: 'var(--accent)',
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }} aria-hidden>
              arrow_back
            </span>
            Profile
          </Link>
          <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--muted)' }} aria-hidden>
            chevron_right
          </span>
          <span style={{ color: 'var(--body)' }} aria-current="page">
            {label}
          </span>
        </nav>

        <header style={{ marginBottom: 24 }}>
          <h1 className={ui.h1}>{title ?? label}</h1>
          {subtitle && <p className={ui.sub}>{subtitle}</p>}
        </header>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>{children}</div>
      </div>

      <style>{`
        .set-input {
          transition: border-color 0.15s var(--ease), box-shadow 0.15s var(--ease);
        }
        .set-input:focus-visible {
          outline: none;
          border-color: var(--primary);
          box-shadow: 0 0 0 3px rgba(124, 92, 255, 0.16);
        }
        .set-linkrow {
          transition: background-color 0.15s var(--ease), border-color 0.15s var(--ease);
        }
        .set-linkrow:hover { background: #f8f6f1; }
        .set-press { transition: transform 0.15s var(--ease); }
        .set-press:active { transform: translateY(1px); }
        @media (prefers-reduced-motion: reduce) {
          .set-input, .set-linkrow, .set-press { transition: none; }
        }
      `}</style>
    </AppShell>
  );
}
