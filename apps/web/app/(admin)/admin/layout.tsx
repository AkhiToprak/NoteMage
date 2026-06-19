'use client';

import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { AdminConsoleStyles } from './_components/ui';

/**
 * Admin shell (P6). Server-rendered RBAC happens at every /api/admin/*
 * endpoint; this layout's role is the client-side existence-leak guard
 * (non-admin sees a 404-shaped page, not an admin chrome we then redirect
 * away from). The 8-tier surface hierarchy and theme tokens are inherited
 * from the root layout / globals.css — we add no new tokens here.
 */

type AdminUser = { id?: string; username?: string; role?: string } | undefined;

type NavItem = {
  href: string;
  label: string;
  icon: string;
  /** True when the current path matches this nav entry (or a descendant of it). */
  matchPrefix: (pathname: string) => boolean;
};

const NAV_ITEMS: NavItem[] = [
  {
    href: '/admin',
    label: 'Dashboard',
    icon: 'dashboard',
    matchPrefix: (p) => p === '/admin',
  },
  {
    href: '/admin/tickets',
    label: 'Tickets',
    icon: 'inbox',
    matchPrefix: (p) => p === '/admin/tickets' || p.startsWith('/admin/tickets/'),
  },
  {
    href: '/admin/paths',
    label: 'Paths',
    icon: 'route',
    matchPrefix: (p) => p === '/admin/paths' || p.startsWith('/admin/paths/'),
  },
  {
    href: '/admin/users',
    label: 'Users',
    icon: 'group',
    matchPrefix: (p) => p === '/admin/users' || p.startsWith('/admin/users/'),
  },
  {
    href: '/admin/waitlist',
    label: 'Waitlist',
    icon: 'list_alt',
    matchPrefix: (p) => p === '/admin/waitlist' || p.startsWith('/admin/waitlist/'),
  },
  {
    href: '/admin/stats',
    label: 'Stats',
    icon: 'query_stats',
    matchPrefix: (p) => p === '/admin/stats' || p.startsWith('/admin/stats/'),
  },
  {
    href: '/admin/pdf-assets',
    label: 'PDF assets',
    icon: 'image',
    matchPrefix: (p) => p === '/admin/pdf-assets' || p.startsWith('/admin/pdf-assets/'),
  },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const user = session?.user as AdminUser;
  const pathname = usePathname();
  const { isPhone } = useBreakpoint();

  // Session still loading — render a neutral placeholder so we don't flash
  // either the admin shell or the 404 stub. Token-driven so light-mode
  // doesn't end up with bright text on a bright background.
  if (status === 'loading') {
    return (
      <div
        style={{
          minHeight: '100dvh',
          background: 'var(--background)',
          color: 'var(--on-surface-variant)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 14,
        }}
      >
        Loading…
      </div>
    );
  }

  // Existence-leak guard. AC-Admin-1: non-admin GET returns 404 — the API
  // returns the literal 404, the page renders a 404 stub. Avoids confirming
  // "this URL exists, you just can't access it".
  if (!user || user.role !== 'admin') {
    return <AdminNotFound />;
  }

  return (
    <div
      style={{
        minHeight: '100dvh',
        background: 'var(--background)',
        color: 'var(--on-surface)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <AdminConsoleStyles />
      <header
        style={{
          background: 'var(--surface-container-low)',
          borderBottom: '1px solid var(--outline-variant)',
          padding: isPhone ? '12px 16px' : '16px 32px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <Link
            href="/admin"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              textDecoration: 'none',
              color: 'var(--on-surface)',
            }}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: 22, color: 'var(--primary)' }}
              aria-hidden
            >
              admin_panel_settings
            </span>
            <span
              className="font-display"
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 18,
                fontWeight: 700,
                letterSpacing: '-0.01em',
              }}
            >
              NoteMage admin
            </span>
          </Link>
          <Link
            href="/my-path"
            aria-label="Back to NoteMage"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 13,
              color: 'var(--on-surface-variant)',
              textDecoration: 'none',
              padding: '6px 10px',
              borderRadius: 'var(--radius-sm)',
              transition: 'transform 0.2s cubic-bezier(0.22,1,0.36,1), opacity 0.2s',
            }}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: 16 }}
              aria-hidden
            >
              arrow_back
            </span>
            Back to app
          </Link>
        </div>
        <nav
          aria-label="Admin sections"
          className="custom-scrollbar"
          style={{
            display: 'flex',
            gap: 4,
            overflowX: 'auto',
            paddingBottom: 2,
          }}
        >
          {NAV_ITEMS.map((item) => {
            const active = item.matchPrefix(pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 14px',
                  borderRadius: 'var(--radius-sm)',
                  background: active ? 'var(--surface-container-high)' : 'transparent',
                  color: active ? 'var(--on-surface)' : 'var(--on-surface-variant)',
                  fontSize: 14,
                  fontWeight: active ? 600 : 500,
                  textDecoration: 'none',
                  whiteSpace: 'nowrap',
                  border: active
                    ? '1px solid var(--outline-variant)'
                    : '1px solid transparent',
                  transition: 'background-color 0.2s, color 0.2s',
                }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{
                    fontSize: 18,
                    color: active ? 'var(--primary)' : 'var(--on-surface-variant)',
                  }}
                  aria-hidden
                >
                  {item.icon}
                </span>
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          padding: isPhone ? '20px 16px 40px' : '28px 32px 48px',
          color: 'var(--on-surface)',
        }}
      >
        {children}
      </main>
    </div>
  );
}

/**
 * 404 stub rendered to non-admins. Mirrors the visual shape of Next's
 * default not-found page so the existence-leak guarantee holds: the page
 * looks identical to a real 404.
 */
function AdminNotFound() {
  return (
    <div
      style={{
        minHeight: '100dvh',
        background: 'var(--background)',
        color: 'var(--on-surface)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        textAlign: 'center',
        gap: 12,
      }}
    >
      <span
        className="font-display"
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 56,
          fontWeight: 800,
          letterSpacing: '-0.02em',
          color: 'var(--on-surface)',
        }}
      >
        404
      </span>
      <p
        style={{
          fontSize: 15,
          color: 'var(--on-surface-variant)',
          margin: 0,
          maxWidth: 420,
        }}
      >
        This page could not be found.
      </p>
      <Link
        href="/"
        style={{
          marginTop: 8,
          padding: '10px 18px',
          background: 'var(--surface-container)',
          color: 'var(--on-surface)',
          border: '1px solid var(--outline-variant)',
          borderRadius: 'var(--radius-md)',
          textDecoration: 'none',
          fontSize: 14,
          fontWeight: 500,
        }}
      >
        Back home
      </Link>
    </div>
  );
}
