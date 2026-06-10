'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { trackEvent } from '@/lib/telemetry';

// Phase 9.3 — /learn layout. Renders a sticky horizontal tab strip across the
// four Learn Hub surfaces, then renders the page content underneath. The
// /learn/chats sub-tree wants the full viewport (left rail + chat thread),
// so the children area is a flex column that can stretch.

interface LearnTab {
  href: string;
  label: string;
  icon: string;
  /** Telemetry slug for the `learn.tab_view` event. */
  slug: 'overview' | 'paths' | 'flashcards' | 'quizzes' | 'chats' | 'community';
  /** Overview matches only the exact /learn index, not every /learn/* route. */
  exact?: boolean;
}

const TABS: ReadonlyArray<LearnTab> = [
  { href: '/learn', label: 'Overview', icon: 'dashboard', slug: 'overview', exact: true },
  { href: '/learn/paths', label: 'Paths', icon: 'stacks', slug: 'paths' },
  { href: '/learn/flashcards', label: 'Flashcards', icon: 'style', slug: 'flashcards' },
  { href: '/learn/quizzes', label: 'Quizzes', icon: 'quiz', slug: 'quizzes' },
  { href: '/learn/chats', label: 'Chats', icon: 'chat', slug: 'chats' },
  { href: '/learn/community', label: 'Community', icon: 'public', slug: 'community' },
];

function isTabActive(tab: LearnTab, pathname: string): boolean {
  if (tab.exact) return pathname === tab.href;
  return pathname === tab.href || pathname.startsWith(`${tab.href}/`);
}

function resolveActiveTab(pathname: string): LearnTab['slug'] | null {
  for (const tab of TABS) {
    if (isTabActive(tab, pathname)) return tab.slug;
  }
  return null;
}

export default function LearnLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '';
  const activeSlug = resolveActiveTab(pathname);

  // Phase 9.6 — fire `learn.tab_view` once per tab transition. Keying the
  // effect on the resolved slug (not the raw pathname) avoids re-firing as
  // the user navigates within a single tab (e.g. /learn/chats → /learn/chats/abc).
  useEffect(() => {
    if (!activeSlug) return;
    trackEvent('learn.tab_view', { tab: activeSlug });
  }, [activeSlug]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
        width: '100%',
      }}
    >
      <nav
        aria-label="Learn sections"
        data-tutorial="learn-tabs"
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'stretch',
          gap: '4px',
          padding: '0 16px',
          background: 'var(--surface-container-low)',
          borderBottom: '1px solid var(--outline-variant)',
          overflowX: 'auto',
          minWidth: 0,
        }}
      >
        {TABS.map((tab) => (
          <TabLink key={tab.href} tab={tab} isActive={isTabActive(tab, pathname)} />
        ))}
      </nav>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          minHeight: 0,
          minWidth: 0,
        }}
      >
        {children}
      </div>
    </div>
  );
}

function TabLink({ tab, isActive }: { tab: LearnTab; isActive: boolean }) {
  return (
    <Link
      href={tab.href}
      aria-current={isActive ? 'page' : undefined}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        padding: '14px 16px',
        marginBottom: '-1px',
        background: isActive ? 'var(--surface-container-high)' : 'transparent',
        color: isActive ? 'var(--md-h4)' : 'var(--on-surface-variant)',
        fontSize: '14px',
        fontWeight: isActive ? 700 : 600,
        textDecoration: 'none',
        borderTopLeftRadius: 'var(--radius-md)',
        borderTopRightRadius: 'var(--radius-md)',
        borderBottom: isActive ? '2px solid var(--md-h4)' : '2px solid transparent',
        transition: 'background-color 0.2s cubic-bezier(0.22, 1, 0.36, 1), color 0.2s cubic-bezier(0.22, 1, 0.36, 1)',
        whiteSpace: 'nowrap',
      }}
      onMouseEnter={(e) => {
        if (!isActive) {
          e.currentTarget.style.background = 'var(--surface-container)';
          e.currentTarget.style.color = 'var(--on-surface)';
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.color = 'var(--on-surface-variant)';
        }
      }}
    >
      <span
        className="material-symbols-outlined"
        style={{
          fontSize: '20px',
          fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0",
        }}
        aria-hidden
      >
        {tab.icon}
      </span>
      {tab.label}
    </Link>
  );
}
